package main

import (
	"archive/zip"
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func zipFixture(t *testing.T, f *fixture, prefix string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "plugin package.zip")
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	archive := zip.NewWriter(file)
	files, err := packageFiles(f.source)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range files {
		data, err := os.ReadFile(filepath.Join(f.source, filepath.FromSlash(name)))
		if err != nil {
			t.Fatal(err)
		}
		writer, err := archive.Create(prefix + name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = writer.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestLocalFolderInstallWithoutCatalogListing(t *testing.T) {
	f := setup(t)
	// Local packages need no marketplace entry and can be outside the project.
	write(t, filepath.Join(f.manager.root, "marketplace", "catalog.json"), []byte(`{"schemaVersion":1,"plugins":[]}`))
	var output bytes.Buffer
	if err := run([]string{"--root", f.manager.root, "install", "--path", filepath.Join(f.source, "plugin.json")}, strings.NewReader(""), &output); err != nil {
		t.Fatal(err)
	}
	registry, err := f.manager.installed()
	if err != nil {
		t.Fatal(err)
	}
	entry := registry.Plugins["example"]
	want := filepath.Join(f.manager.root, "plugins", "installed", "example", "1.0.0")
	if f.manager.packagePath(entry.Manifest) != want {
		t.Fatal("package was not copied into plugins folder")
	}
	before, err := packageHash(want)
	if err != nil {
		t.Fatal(err)
	}
	write(t, filepath.Join(f.source, "index.js"), []byte("changed source"))
	after, err := packageHash(want)
	if err != nil || before != after {
		t.Fatal("installed copy changed with source", err)
	}
}

func TestZIPInstallAndPreviewIntegrity(t *testing.T) {
	for _, prefix := range []string{"", "my-plugin/"} {
		t.Run(prefix, func(t *testing.T) {
			f := setup(t)
			path := zipFixture(t, f, prefix)
			_, listing, cleanup, err := prepareLocal(path)
			if err != nil {
				t.Fatal(err)
			}
			cleanup()
			if err := f.manager.installLocal(path, listing.SHA256); err != nil {
				t.Fatal(err)
			}
			hash, err := packageHash(f.manager.packagePath(f.manifest))
			if err != nil || hash != listing.SHA256 {
				t.Fatal(hash, err)
			}
			if err := f.manager.installLocal(path, strings.Repeat("0", 64)); err == nil {
				t.Fatal("changed preview accepted")
			}
		})
	}
}

func TestZIPRejectsUnsafeEntries(t *testing.T) {
	for _, name := range []string{"../escape.js", "/absolute.js", "C:/escape.js", "dir\\escape.js", "CON.js", "a/../../escape.js", "index.js\x00.txt"} {
		t.Run(name, func(t *testing.T) {
			var buffer bytes.Buffer
			archive := zip.NewWriter(&buffer)
			entry, err := archive.Create(name)
			if err != nil {
				t.Fatal(err)
			}
			entry.Write([]byte("x"))
			archive.Close()
			path := filepath.Join(t.TempDir(), "bad.zip")
			write(t, path, buffer.Bytes())
			if err := unpackZIP(path, t.TempDir()); err == nil {
				t.Fatal("unsafe ZIP entry accepted")
			}
		})
	}
	t.Run("symlink", func(t *testing.T) {
		var buffer bytes.Buffer
		archive := zip.NewWriter(&buffer)
		header := &zip.FileHeader{Name: "linked.js"}
		header.SetMode(os.ModeSymlink | 0777)
		entry, _ := archive.CreateHeader(header)
		entry.Write([]byte("../outside"))
		archive.Close()
		path := filepath.Join(t.TempDir(), "link.zip")
		write(t, path, buffer.Bytes())
		if err := unpackZIP(path, t.TempDir()); err == nil {
			t.Fatal("ZIP link accepted")
		}
	})
	t.Run("duplicate-case", func(t *testing.T) {
		var buffer bytes.Buffer
		archive := zip.NewWriter(&buffer)
		archive.Create("index.js")
		archive.Create("INDEX.js")
		archive.Close()
		path := filepath.Join(t.TempDir(), "duplicate.zip")
		write(t, path, buffer.Bytes())
		if err := unpackZIP(path, t.TempDir()); err == nil {
			t.Fatal("duplicate ZIP path accepted")
		}
	})
	t.Run("expanded-size", func(t *testing.T) {
		var buffer bytes.Buffer
		archive := zip.NewWriter(&buffer)
		entry, _ := archive.Create("large.js")
		entry.Write(bytes.Repeat([]byte("x"), 21*1024*1024))
		archive.Close()
		path := filepath.Join(t.TempDir(), "large.zip")
		write(t, path, buffer.Bytes())
		if err := unpackZIP(path, t.TempDir()); err == nil {
			t.Fatal("oversized expanded ZIP accepted")
		}
	})
}

func TestTUILocalPathInspectCancelAndInstall(t *testing.T) {
	f := setup(t)
	ui, err := newTUI(f.manager)
	if err != nil {
		t.Fatal(err)
	}
	ui.key("a")
	for _, r := range f.source {
		ui.key(string(r))
	}
	ui.key("enter")
	if ui.dialog == nil || ui.dialog.action != "local-install" {
		t.Fatal("missing preview", ui.dialog)
	}
	ui.key("esc")
	registry, _ := f.manager.installed()
	if len(registry.Plugins) != 0 {
		t.Fatal("cancel installed a package")
	}
	ui.key("a")
	ui.key("enter")
	if ui.dialog.problem == "" {
		t.Fatal("empty path did not show error")
	}
	ui.key("esc")
	ui.key("a")
	for _, r := range f.source {
		ui.key(string(r))
	}
	ui.key("enter")
	ui.key("y")
	if ui.problem || ui.status("example") != "enabled" {
		t.Fatal(ui.notice)
	}
}
