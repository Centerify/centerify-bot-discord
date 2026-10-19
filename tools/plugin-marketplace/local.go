package main

import (
	"archive/zip"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// Local packages are inspected without executing code. ZIP contents only go to
// a temporary directory; the verified copy pipeline handles every install.
func prepareLocal(path string) (string, Listing, func(), error) {
	cleanup := func() {}
	fail := func(err error) (string, Listing, func(), error) { cleanup(); return "", Listing{}, func() {}, err }
	path = strings.Trim(strings.TrimSpace(path), "\"")
	if strings.HasPrefix(path, "~/") || strings.HasPrefix(path, "~\\") {
		home, err := os.UserHomeDir()
		if err != nil {
			return fail(err)
		}
		path = filepath.Join(home, path[2:])
	}
	if path == "" {
		return fail(errors.New("enter a package folder, plugin.json file, or ZIP file"))
	}
	source, err := filepath.Abs(path)
	if err != nil {
		return fail(err)
	}
	info, err := os.Lstat(source)
	if err != nil {
		return fail(err)
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return fail(errors.New("package path cannot be a symbolic link"))
	}
	if !info.IsDir() {
		switch {
		case strings.EqualFold(filepath.Ext(source), ".zip"):
			if info.Size() > 24*1024*1024 {
				return fail(errors.New("ZIP file exceeds 24 MiB"))
			}
			temp, err := os.MkdirTemp("", "centerify-plugin-import-")
			if err != nil {
				return fail(err)
			}
			cleanup = func() { os.RemoveAll(temp) }
			if err := unpackZIP(source, temp); err != nil {
				return fail(err)
			}
			source = temp
			if _, err := os.Stat(filepath.Join(source, "plugin.json")); os.IsNotExist(err) {
				entries, readErr := os.ReadDir(source)
				if readErr != nil {
					return fail(readErr)
				}
				if len(entries) == 1 && entries[0].IsDir() {
					source = filepath.Join(source, entries[0].Name())
				}
			}
		case filepath.Base(source) == "plugin.json":
			source = filepath.Dir(source)
		default:
			return fail(errors.New("select a package folder, plugin.json file, or .zip archive"))
		}
	}
	// A developer's plugin folder can contain a ready-to-install package/ folder.
	if _, err := os.Stat(filepath.Join(source, "package", "plugin.json")); err == nil {
		source = filepath.Join(source, "package")
	}
	manifest := Manifest{}
	if err := readJSON(filepath.Join(source, "plugin.json"), &manifest, false); err != nil {
		return fail(fmt.Errorf("package needs plugin.json: %w", err))
	}
	if err := validManifest(manifest); err != nil {
		return fail(err)
	}
	entry, err := checkedPath(source, manifest.Entrypoint)
	if err != nil {
		return fail(err)
	}
	if info, err := os.Stat(entry); err != nil || !info.Mode().IsRegular() {
		return fail(errors.New("package entrypoint is missing"))
	}
	hash, err := packageHash(source)
	if err != nil {
		return fail(err)
	}
	return source, Listing{Manifest: manifest, SHA256: hash}, cleanup, nil
}

func (m *Manager) installLocal(path, expectedHash string) error {
	source, listing, cleanup, err := prepareLocal(path)
	if err != nil {
		return err
	}
	defer cleanup()
	if expectedHash != "" && listing.SHA256 != expectedHash {
		return errors.New("local package changed after inspection; inspect it again")
	}
	return m.installSource(source, listing)
}

func portablePath(name string) bool {
	if !filePattern.MatchString(name) || strings.HasPrefix(name, "/") {
		return false
	}
	for _, part := range strings.Split(name, "/") {
		if part == "" || part == "." || part == ".." || strings.HasSuffix(part, ".") {
			return false
		}
		base := strings.ToUpper(strings.SplitN(part, ".", 2)[0])
		if base == "CON" || base == "PRN" || base == "AUX" || base == "NUL" {
			return false
		}
		if len(base) == 4 && (strings.HasPrefix(base, "COM") || strings.HasPrefix(base, "LPT")) && base[3] >= '1' && base[3] <= '9' {
			return false
		}
	}
	return true
}

func unpackZIP(path, destination string) error {
	archive, err := zip.OpenReader(path)
	if err != nil {
		return err
	}
	defer archive.Close()
	if len(archive.File) > 400 {
		return errors.New("ZIP archive exceeds 400 entries")
	}
	seen := map[string]bool{}
	var total int64
	count := 0
	for _, entry := range archive.File {
		name := strings.TrimSuffix(entry.Name, "/")
		if !portablePath(name) {
			return errors.New("ZIP contains an unsafe or non-portable path")
		}
		key := strings.ToLower(name)
		if seen[key] {
			return errors.New("ZIP contains duplicate paths")
		}
		seen[key] = true
		if entry.Mode()&os.ModeSymlink != 0 || (!entry.FileInfo().IsDir() && !entry.Mode().IsRegular()) {
			return errors.New("ZIP links and special files are not supported")
		}
		target, err := inside(destination, name)
		if err != nil {
			return err
		}
		if entry.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0700); err != nil {
				return err
			}
			continue
		}
		count++
		if count > 200 || entry.UncompressedSize64 > uint64(20*1024*1024-total) {
			return errors.New("ZIP exceeds package limits (200 files, 20 MiB)")
		}
		if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
			return err
		}
		reader, err := entry.Open()
		if err != nil {
			return err
		}
		data, readErr := io.ReadAll(io.LimitReader(reader, 20*1024*1024-total+1))
		closeErr := reader.Close()
		if readErr != nil {
			return readErr
		}
		if closeErr != nil {
			return closeErr
		}
		total += int64(len(data))
		if total > 20*1024*1024 {
			return errors.New("ZIP exceeds 20 MiB")
		}
		if err := os.WriteFile(target, data, 0600); err != nil {
			return err
		}
	}
	return nil
}
