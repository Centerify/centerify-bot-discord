//go:build ignore

// Run with: go run build.go. Go is needed to build, never to run the outputs.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func main() {
	root, err := filepath.Abs("../..")
	if err != nil {
		panic(err)
	}
	output := filepath.Join(root, "artifacts", "plugin-installer")
	if err := os.MkdirAll(output, 0755); err != nil {
		panic(err)
	}
	var sums strings.Builder
	for _, target := range []string{"windows/amd64", "windows/arm64", "darwin/amd64", "darwin/arm64", "linux/amd64", "linux/arm64"} {
		parts := strings.Split(target, "/")
		name := "centerify-plugins"
		if parts[0] == "windows" {
			name += ".exe"
		}
		relative := parts[0] + "-" + parts[1] + "/" + name
		path := filepath.Join(output, filepath.FromSlash(relative))
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			panic(err)
		}
		command := exec.Command("go", "build", "-trimpath", "-ldflags=-s -w -buildid=", "-o", path, ".")
		command.Env = append(os.Environ(), "GOOS="+parts[0], "GOARCH="+parts[1], "CGO_ENABLED=0", "GOTOOLCHAIN=local", "MS_GO_NOSYSTEMCRYPTO=1")
		command.Stdout = os.Stdout
		command.Stderr = os.Stderr
		if err := command.Run(); err != nil {
			panic(err)
		}
		data, err := os.ReadFile(path)
		if err != nil {
			panic(err)
		}
		hash := sha256.Sum256(data)
		fmt.Fprintf(&sums, "%s  %s\n", hex.EncodeToString(hash[:]), relative)
		fmt.Printf("%s: %d bytes\n", relative, len(data))
	}
	if err := os.WriteFile(filepath.Join(output, "SHA256SUMS"), []byte(sums.String()), 0644); err != nil {
		panic(err)
	}
}
