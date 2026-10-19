package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type Manifest struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Version      string   `json:"version"`
	Description  string   `json:"description"`
	APIVersion   int      `json:"apiVersion"`
	Entrypoint   string   `json:"entrypoint"`
	Permissions  []string `json:"permissions"`
	Dependencies []string `json:"dependencies"`
}
type Listing struct {
	Manifest    Manifest `json:"manifest"`
	PackagePath string   `json:"packagePath"`
	SHA256      string   `json:"sha256"`
}
type Catalog struct {
	SchemaVersion int       `json:"schemaVersion"`
	Plugins       []Listing `json:"plugins"`
}
type Installation struct {
	Manifest    Manifest `json:"manifest"`
	SHA256      string   `json:"sha256"`
	Enabled     bool     `json:"enabled"`
	InstalledAt string   `json:"installedAt"`
}
type Registry struct {
	SchemaVersion int                     `json:"schemaVersion"`
	Plugins       map[string]Installation `json:"plugins"`
}
type Manager struct{ root, state string }

var idPattern = regexp.MustCompile(`^[a-z][a-z0-9-]{0,47}$`)
var versionPattern = regexp.MustCompile(`^\d+\.\d+\.\d+$`)
var hashPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var filePattern = regexp.MustCompile(`^[A-Za-z0-9_./-]+$`)
var hostModules = map[string]bool{"runtime": true, "guilds": true, "moderation": true, "xp": true, "welcome": true, "custom-commands": true, "settings": true, "management": true, "tickets": true, "information": true, "plugins": true}

func newManager(root, state string) (*Manager, error) {
	absolute, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	absolute, err = filepath.EvalSymlinks(absolute)
	if err != nil {
		return nil, err
	}
	if state == "" {
		state = filepath.Join(absolute, ".centerify")
	}
	state, err = filepath.Abs(state)
	if err != nil {
		return nil, err
	}
	return &Manager{absolute, state}, nil
}
func inside(root, path string) (string, error) {
	if !filepath.IsAbs(path) {
		path = filepath.Join(root, filepath.FromSlash(path))
	}
	path = filepath.Clean(path)
	part, err := filepath.Rel(root, path)
	if err != nil || filepath.IsAbs(part) || part == ".." || strings.HasPrefix(part, ".."+string(filepath.Separator)) {
		return "", errors.New("plugin path escapes its allowed directory")
	}
	return path, nil
}
func checkedPath(root, path string) (string, error) {
	absolute, err := inside(root, path)
	if err != nil {
		return "", err
	}
	real, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return "", err
	}
	return inside(root, real)
}
func validManifest(m Manifest) error {
	if !idPattern.MatchString(m.ID) || !portablePath(m.ID) || !versionPattern.MatchString(m.Version) || m.APIVersion != 1 {
		return errors.New("invalid plugin identity, version, or API compatibility")
	}
	if hostModules[m.ID] {
		return errors.New("plugin ID collides with a host module")
	}
	if len(m.Name) < 1 || len(m.Name) > 80 || len(m.Description) < 1 || len(m.Description) > 500 || len(m.Permissions) > 30 || len(m.Dependencies) > 20 {
		return errors.New("plugin metadata exceeds supported limits")
	}
	if m.Permissions == nil || m.Dependencies == nil {
		return errors.New("manifest permissions and dependencies must be arrays")
	}
	if !filePattern.MatchString(m.Entrypoint) || !strings.HasSuffix(m.Entrypoint, ".js") || strings.HasPrefix(m.Entrypoint, "/") || strings.Contains(m.Entrypoint, "//") {
		return errors.New("invalid plugin entrypoint")
	}
	for _, part := range strings.Split(m.Entrypoint, "/") {
		if part == ".." || part == "." {
			return errors.New("invalid plugin entrypoint")
		}
	}
	for _, permission := range m.Permissions {
		if len(permission) < 1 || len(permission) > 80 {
			return errors.New("invalid permission declaration")
		}
	}
	seen := map[string]bool{}
	for _, dependency := range m.Dependencies {
		if !idPattern.MatchString(dependency) || dependency == m.ID || seen[dependency] {
			return errors.New("invalid or duplicate plugin dependency")
		}
		seen[dependency] = true
	}
	return nil
}
func readJSON(path string, destination any, missing bool) error {
	file, err := os.Open(path)
	if os.IsNotExist(err) && missing {
		return nil
	}
	if err != nil {
		return err
	}
	defer file.Close()
	decoder := json.NewDecoder(io.LimitReader(file, 4*1024*1024+1))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	var tail any
	if err := decoder.Decode(&tail); err != io.EOF {
		return errors.New("unexpected trailing JSON data")
	}
	return nil
}
func (m *Manager) catalog() (Catalog, error) {
	c := Catalog{SchemaVersion: 1, Plugins: []Listing{}}
	if err := readJSON(filepath.Join(m.root, "marketplace", "catalog.json"), &c, false); err != nil {
		return c, err
	}
	if c.SchemaVersion != 1 || len(c.Plugins) > 100 {
		return c, errors.New("unsupported marketplace catalog")
	}
	seen := map[string]bool{}
	for _, entry := range c.Plugins {
		if err := validManifest(entry.Manifest); err != nil {
			return c, err
		}
		if seen[entry.Manifest.ID] || !hashPattern.MatchString(entry.SHA256) {
			return c, errors.New("duplicate plugin or invalid package checksum")
		}
		seen[entry.Manifest.ID] = true
		if _, err := inside(m.root, entry.PackagePath); err != nil {
			return c, err
		}
	}
	return c, nil
}
func (m *Manager) installed() (Registry, error) {
	r := Registry{SchemaVersion: 1, Plugins: map[string]Installation{}}
	if err := readJSON(filepath.Join(m.state, "installed.json"), &r, true); err != nil {
		return r, err
	}
	if r.SchemaVersion != 1 || r.Plugins == nil {
		return r, errors.New("unsupported installed registry")
	}
	for id, entry := range r.Plugins {
		if id != entry.Manifest.ID || !hashPattern.MatchString(entry.SHA256) {
			return r, errors.New("installed identity or checksum mismatch")
		}
		if err := validManifest(entry.Manifest); err != nil {
			return r, err
		}
		if _, err := time.Parse(time.RFC3339Nano, entry.InstalledAt); err != nil {
			return r, errors.New("invalid installation timestamp")
		}
	}
	return r, nil
}
func (m *Manager) packagePath(manifest Manifest) string {
	return filepath.Join(m.root, "plugins", "installed", manifest.ID, manifest.Version)
}
func packageFiles(root string) ([]string, error) {
	files := []string{}
	seen := map[string]bool{}
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return errors.New("symbolic links are not permitted in plugin packages")
		}
		if entry.IsDir() {
			return nil
		}
		if !entry.Type().IsRegular() {
			return errors.New("special files are not permitted in plugin packages")
		}
		part, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		name := filepath.ToSlash(part)
		if !portablePath(name) || seen[strings.ToLower(name)] {
			return errors.New("package filenames must use portable ASCII characters")
		}
		seen[strings.ToLower(name)] = true
		files = append(files, name)
		if len(files) > 200 {
			return errors.New("plugin package exceeds 200 files")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if len(files) == 0 {
		return nil, errors.New("plugin package is empty")
	}
	sort.Strings(files)
	return files, nil
}
func packageHash(root string) (string, error) {
	files, err := packageFiles(root)
	if err != nil {
		return "", err
	}
	hash := sha256.New()
	var total int64
	for _, name := range files {
		path := filepath.Join(root, filepath.FromSlash(name))
		info, err := os.Lstat(path)
		if err != nil || !info.Mode().IsRegular() {
			return "", errors.New("package file changed during verification")
		}
		if info.Size() > 20*1024*1024-total {
			return "", errors.New("plugin package exceeds 20 MiB")
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return "", err
		}
		total += int64(len(data))
		if total > 20*1024*1024 || int64(len(data)) != info.Size() {
			return "", errors.New("package changed or exceeds size limit")
		}
		io.WriteString(hash, name+"\x00"+strconv.Itoa(len(data))+"\x00")
		hash.Write(data)
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

// Windows scanners can briefly hold freshly written files. Retry only transient
// access/sharing errors; all other rename failures are returned immediately.
func renameFile(source, destination string) error {
	for attempt := 0; ; attempt++ {
		err := os.Rename(source, destination)
		if err == nil || runtime.GOOS != "windows" || attempt >= 7 || (!errors.Is(err, fs.ErrPermission) && !errors.Is(err, syscall.Errno(32))) {
			return err
		}
		time.Sleep(time.Duration(attempt+1) * 15 * time.Millisecond)
	}
}

func (m *Manager) packageDirectory(parts ...string) (string, error) {
	path := m.root
	for _, part := range append([]string{"plugins", "installed"}, parts...) {
		path = filepath.Join(path, part)
		if err := os.Mkdir(path, 0700); err != nil && !os.IsExist(err) {
			return "", err
		}
		info, err := os.Lstat(path)
		if err != nil {
			return "", err
		}
		if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return "", errors.New("installed package path cannot contain links or special files")
		}
	}
	return path, nil
}

func atomicJSON(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".registry-*.tmp")
	if err != nil {
		return err
	}
	temp := file.Name()
	defer os.Remove(temp)
	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	err = encoder.Encode(value)
	if err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return renameFile(temp, path)
}
func (m *Manager) change(operation func(*Registry) error) error {
	if err := os.MkdirAll(m.state, 0700); err != nil {
		return err
	}
	lock, err := os.OpenFile(filepath.Join(m.state, "registry-native.lock"), os.O_RDWR|os.O_CREATE, 0600)
	if err != nil {
		return err
	}
	defer lock.Close()
	unlock, err := lockFile(lock)
	if err != nil {
		return fmt.Errorf("another installer is running: %w", err)
	}
	defer unlock()
	registry, err := m.installed()
	if err != nil {
		return err
	}
	if err := operation(&registry); err != nil {
		return err
	}
	return atomicJSON(filepath.Join(m.state, "installed.json"), registry)
}
func checkDependencies(registry Registry) error {
	visiting, visited := map[string]bool{}, map[string]bool{}
	var visit func(string) error
	visit = func(id string) error {
		if visited[id] || hostModules[id] {
			return nil
		}
		if visiting[id] {
			return errors.New("cyclic plugin dependencies")
		}
		entry, ok := registry.Plugins[id]
		if !ok || !entry.Enabled {
			return fmt.Errorf("required plugin %s is missing or disabled", id)
		}
		visiting[id] = true
		for _, dep := range entry.Manifest.Dependencies {
			if err := visit(dep); err != nil {
				return err
			}
		}
		delete(visiting, id)
		visited[id] = true
		return nil
	}
	for id, entry := range registry.Plugins {
		if entry.Enabled {
			if err := visit(id); err != nil {
				return err
			}
		}
	}
	return nil
}
func (m *Manager) install(id string) error {
	if !idPattern.MatchString(id) {
		return errors.New("invalid plugin ID")
	}
	catalog, err := m.catalog()
	if err != nil {
		return err
	}
	for _, chosen := range catalog.Plugins {
		if chosen.Manifest.ID != id {
			continue
		}
		source, err := checkedPath(m.root, chosen.PackagePath)
		if err != nil {
			return err
		}
		return m.installSource(source, chosen)
	}
	return errors.New("plugin is not listed in the marketplace")
}
func (m *Manager) installSource(source string, chosen Listing) error {
	return m.change(func(registry *Registry) error {
		id := chosen.Manifest.ID
		hash, err := packageHash(source)
		if err != nil {
			return err
		}
		if hash != chosen.SHA256 {
			return errors.New("marketplace package integrity check failed")
		}
		manifest := Manifest{}
		if err := readJSON(filepath.Join(source, "plugin.json"), &manifest, false); err != nil {
			return err
		}
		if err := validManifest(manifest); err != nil {
			return err
		}
		if !reflect.DeepEqual(manifest, chosen.Manifest) {
			return errors.New("package manifest does not match its listing")
		}
		entrypoint, err := checkedPath(source, manifest.Entrypoint)
		if err != nil {
			return err
		}
		if info, err := os.Stat(entrypoint); err != nil || !info.Mode().IsRegular() {
			return errors.New("entrypoint is not a regular file")
		}
		old, exists := registry.Plugins[id]
		if exists && old.Manifest.Version == manifest.Version && old.SHA256 != chosen.SHA256 {
			return errors.New("published versions cannot be replaced with different content")
		}
		enabled := true
		if exists {
			enabled = old.Enabled
		}
		registry.Plugins[id] = Installation{manifest, chosen.SHA256, enabled, time.Now().UTC().Format(time.RFC3339Nano)}
		if err := checkDependencies(*registry); err != nil {
			return err
		}
		stagingRoot, err := m.packageDirectory(".staging")
		if err != nil {
			return err
		}
		if _, err := m.packageDirectory(manifest.ID); err != nil {
			return err
		}
		staged, err := os.MkdirTemp(stagingRoot, "package-")
		if err != nil {
			return err
		}
		defer os.RemoveAll(staged)
		files, err := packageFiles(source)
		if err != nil {
			return err
		}
		for _, name := range files {
			input := filepath.Join(source, filepath.FromSlash(name))
			info, err := os.Lstat(input)
			if err != nil || !info.Mode().IsRegular() {
				return errors.New("source file changed while copying")
			}
			data, err := os.ReadFile(input)
			if err != nil {
				return err
			}
			if len(data) > 20*1024*1024 {
				return errors.New("package file exceeds limit")
			}
			target := filepath.Join(staged, filepath.FromSlash(name))
			if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
				return err
			}
			if err := os.WriteFile(target, data, 0600); err != nil {
				return err
			}
		}
		hash, err = packageHash(staged)
		if err != nil {
			return err
		}
		if hash != chosen.SHA256 {
			return errors.New("copied package failed its integrity check")
		}
		target := m.packagePath(manifest)
		if info, err := os.Lstat(target); err == nil {
			if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
				return errors.New("invalid installed package directory")
			}
			existing, err := packageHash(target)
			if err != nil {
				return err
			}
			if existing != chosen.SHA256 {
				return errors.New("installed package is damaged; uninstall and remove the damaged package before reinstalling")
			}
			return nil
		} else if !os.IsNotExist(err) {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
			return err
		}
		return renameFile(staged, target)
	})
}
func (m *Manager) setEnabled(id string, enabled bool) error {
	if !idPattern.MatchString(id) {
		return errors.New("invalid plugin ID")
	}
	return m.change(func(registry *Registry) error {
		entry, ok := registry.Plugins[id]
		if !ok {
			return errors.New("install this plugin first")
		}
		entry.Enabled = enabled
		registry.Plugins[id] = entry
		return checkDependencies(*registry)
	})
}
func (m *Manager) uninstall(id string) error {
	if !idPattern.MatchString(id) {
		return errors.New("invalid plugin ID")
	}
	return m.change(func(registry *Registry) error {
		if _, ok := registry.Plugins[id]; !ok {
			return errors.New("plugin is not installed")
		}
		delete(registry.Plugins, id)
		return checkDependencies(*registry)
	})
}
