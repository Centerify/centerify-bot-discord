package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCheckedPathCanonicalRoot(t *testing.T) {
	parent := t.TempDir()
	realRoot := filepath.Join(parent, "real")
	write(t, filepath.Join(realRoot, "package", "index.js"), []byte("export default {}"))
	alias := filepath.Join(parent, "alias")
	if err := os.Symlink(realRoot, alias); err != nil {
		t.Skipf("directory symlinks unavailable: %v", err)
	}
	root := filepath.Join(alias, "package")
	want, err := filepath.EvalSymlinks(filepath.Join(root, "index.js"))
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"index.js", filepath.Join(root, "index.js")} {
		got, err := checkedPath(root, path)
		if err != nil || got != want {
			t.Fatalf("valid path %q: got %q, error %v", path, got, err)
		}
	}
	outside := filepath.Join(parent, "outside.js")
	write(t, outside, []byte("outside"))
	if _, err := checkedPath(root, outside); err == nil {
		t.Fatal("outside path accepted")
	}
	if _, err := checkedPath(root, filepath.Join("..", "..", "outside.js")); err == nil {
		t.Fatal("parent traversal accepted")
	}
	if err := os.Symlink(outside, filepath.Join(realRoot, "package", "escape.js")); err != nil {
		t.Fatal(err)
	}
	if _, err := checkedPath(root, "escape.js"); err == nil {
		t.Fatal("escaping symlink accepted")
	}
}
