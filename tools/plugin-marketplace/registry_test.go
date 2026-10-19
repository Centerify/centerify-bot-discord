package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type fixture struct {
	manager  *Manager
	source   string
	manifest Manifest
}

func setup(t *testing.T) *fixture {
	t.Helper()
	root := t.TempDir()
	m, err := newManager(root, "")
	if err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(root, "plugins", "example", "package")
	if err := os.MkdirAll(source, 0700); err != nil {
		t.Fatal(err)
	}
	manifest := Manifest{"example", "Example", "1.0.0", "A fixture plugin", 1, "index.js", []string{"SendMessages"}, []string{"guilds"}}
	f := &fixture{m, source, manifest}
	write(t, filepath.Join(source, "index.js"), []byte("export default () => ({});\n"))
	write(t, filepath.Join(source, "package.json"), []byte("{\"type\":\"module\"}\n"))
	f.publish(t)
	return f
}
func write(t *testing.T, path string, data []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
}
func (f *fixture) publish(t *testing.T) {
	t.Helper()
	raw, _ := json.Marshal(f.manifest)
	write(t, filepath.Join(f.source, "plugin.json"), raw)
	hash, err := packageHash(f.source)
	if err != nil {
		t.Fatal(err)
	}
	catalog := Catalog{1, []Listing{{f.manifest, "plugins/example/package", hash}}}
	raw, _ = json.Marshal(catalog)
	write(t, filepath.Join(f.manager.root, "marketplace", "catalog.json"), raw)
}
func TestInstallLifecycle(t *testing.T) {
	f := setup(t)
	before, err := f.manager.installed()
	if err != nil || len(before.Plugins) != 0 {
		t.Fatal(before, err)
	}
	if err := f.manager.install("example"); err != nil {
		t.Fatal(err)
	}
	state, err := f.manager.installed()
	if err != nil || !state.Plugins["example"].Enabled {
		t.Fatal(state, err)
	}
	if err := f.manager.install("example"); err != nil {
		t.Fatal("idempotent install:", err)
	}
	if err := f.manager.setEnabled("example", false); err != nil {
		t.Fatal(err)
	}
	again, _ := newManager(f.manager.root, "")
	state, err = again.installed()
	if err != nil || state.Plugins["example"].Enabled {
		t.Fatal("disabled state did not persist", err)
	}
	if err := again.setEnabled("example", true); err != nil {
		t.Fatal(err)
	}
	saved := filepath.Join(f.manager.state, "data", "example", "server.json")
	write(t, saved, []byte("saved tickets"))
	if err := again.uninstall("example"); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(saved)
	if err != nil || string(data) != "saved tickets" {
		t.Fatal("uninstall destroyed saved data", err)
	}
	state, _ = again.installed()
	if len(state.Plugins) != 0 {
		t.Fatal("uninstall did not persist")
	}
}
func TestTamperedPackage(t *testing.T) {
	f := setup(t)
	write(t, filepath.Join(f.source, "index.js"), []byte("changed"))
	if err := f.manager.install("example"); err == nil || !strings.Contains(err.Error(), "integrity") {
		t.Fatal(err)
	}
	state, _ := f.manager.installed()
	if len(state.Plugins) != 0 {
		t.Fatal("failed install modified registry")
	}
}
func TestImmutableVersion(t *testing.T) {
	f := setup(t)
	if err := f.manager.install("example"); err != nil {
		t.Fatal(err)
	}
	write(t, filepath.Join(f.source, "index.js"), []byte("changed"))
	f.publish(t)
	if err := f.manager.install("example"); err == nil {
		t.Fatal("mutated published version was accepted")
	}
}
func TestUpdatePreservesDisabledState(t *testing.T) {
	f := setup(t)
	if err := f.manager.install("example"); err != nil {
		t.Fatal(err)
	}
	if err := f.manager.setEnabled("example", false); err != nil {
		t.Fatal(err)
	}
	f.manifest.Version = "1.1.0"
	f.publish(t)
	if err := f.manager.install("example"); err != nil {
		t.Fatal(err)
	}
	state, _ := f.manager.installed()
	if state.Plugins["example"].Enabled || state.Plugins["example"].Manifest.Version != "1.1.0" {
		t.Fatal("update did not preserve disabled state")
	}
}
func TestManifestValidation(t *testing.T) {
	for _, kind := range []string{"id", "api", "entrypoint", "dependency", "host-id"} {
		t.Run(kind, func(t *testing.T) {
			f := setup(t)
			switch kind {
			case "id":
				f.manifest.ID = "../escape"
			case "api":
				f.manifest.APIVersion = 99
			case "entrypoint":
				f.manifest.Entrypoint = "../index.js"
			case "dependency":
				f.manifest.Dependencies = []string{"example"}
			case "host-id":
				f.manifest.ID = "guilds"
			}
			f.publish(t)
			if err := f.manager.install("example"); err == nil {
				t.Fatal("invalid manifest accepted")
			}
		})
	}
}
func TestTraversal(t *testing.T) {
	f := setup(t)
	for _, path := range []string{"../outside", filepath.Join(f.manager.root, "..", "outside")} {
		if _, err := inside(f.manager.root, path); err == nil {
			t.Fatal("traversal accepted")
		}
	}
	if err := f.manager.install("../example"); err == nil {
		t.Fatal("bad ID accepted")
	}
}
func TestDependencyProtection(t *testing.T) {
	f := setup(t)
	if err := f.manager.install("example"); err != nil {
		t.Fatal(err)
	}
	state, _ := f.manager.installed()
	child := state.Plugins["example"]
	child.Manifest.ID = "child"
	child.Manifest.Dependencies = []string{"example"}
	state.Plugins["child"] = child
	if err := atomicJSON(filepath.Join(f.manager.state, "installed.json"), state); err != nil {
		t.Fatal(err)
	}
	if err := f.manager.setEnabled("example", false); err == nil {
		t.Fatal("enabled dependent lost its dependency")
	}
	if err := f.manager.uninstall("example"); err == nil {
		t.Fatal("dependency uninstall allowed")
	}
	state, _ = f.manager.installed()
	if !state.Plugins["example"].Enabled {
		t.Fatal("failed operation changed registry")
	}
}
func TestMissingDependency(t *testing.T) {
	f := setup(t)
	f.manifest.Dependencies = []string{"missing"}
	f.publish(t)
	if err := f.manager.install("example"); err == nil {
		t.Fatal("missing dependency accepted")
	}
}
func TestManifestIdentityMismatch(t *testing.T) {
	f := setup(t)
	f.manifest.Name = "Different"
	raw, _ := json.Marshal(f.manifest)
	write(t, filepath.Join(f.source, "plugin.json"), raw)
	hash, _ := packageHash(f.source)
	catalog, _ := f.manager.catalog()
	catalog.Plugins[0].SHA256 = hash
	raw, _ = json.Marshal(catalog)
	write(t, filepath.Join(f.manager.root, "marketplace", "catalog.json"), raw)
	if err := f.manager.install("example"); err == nil {
		t.Fatal("manifest mismatch accepted")
	}
}
func TestCLI(t *testing.T) {
	f := setup(t)
	var output bytes.Buffer
	for _, args := range [][]string{{"--root", f.manager.root, "--json", "marketplace"}, {"--root", f.manager.root, "install", "example"}, {"--root", f.manager.root, "verify", "example"}} {
		if err := run(args, strings.NewReader("1\n2\n0\n"), &output); err != nil {
			t.Fatal(err)
		}
	}
	if err := run([]string{"--root", f.manager.root, "uninstall", "example"}, strings.NewReader(""), &output); err == nil {
		t.Fatal("uninstall needs confirmation")
	}
	if !strings.Contains(output.String(), "integrity verified") || !strings.Contains(output.String(), "\"schemaVersion\":1") {
		t.Fatal(output.String())
	}
	if err := run([]string{"--root", f.manager.root, "tui"}, strings.NewReader("q"), &output); err == nil {
		t.Fatal("full-screen TUI accepted non-terminal input")
	}
}
func TestCorruptRegistryFailsClosed(t *testing.T) {
	f := setup(t)
	write(t, filepath.Join(f.manager.state, "installed.json"), []byte("{broken"))
	if err := f.manager.install("example"); err == nil {
		t.Fatal("corrupt registry was overwritten")
	}
}
func TestLockReleasedAfterFailure(t *testing.T) {
	f := setup(t)
	if err := f.manager.install("missing"); err == nil {
		t.Fatal("missing package accepted")
	}
	if err := f.manager.install("example"); err != nil {
		t.Fatal("lock was not released:", err)
	}
}
func TestOversizedPackage(t *testing.T) {
	f := setup(t)
	write(t, filepath.Join(f.source, "too-big.js"), make([]byte, 20*1024*1024+1))
	if _, err := packageHash(f.source); err == nil {
		t.Fatal("oversized package accepted")
	}
}
func TestSymlinkPackage(t *testing.T) {
	f := setup(t)
	if err := os.Symlink(filepath.Join(f.source, "index.js"), filepath.Join(f.source, "linked.js")); err != nil {
		t.Skip("symlinks unavailable:", err)
	}
	if _, err := packageHash(f.source); err == nil {
		t.Fatal("symlink accepted")
	}
}
