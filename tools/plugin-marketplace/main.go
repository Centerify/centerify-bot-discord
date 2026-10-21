package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"text/tabwriter"
	"unicode"
)

const version = "1.0.0"

func main() {
	if err := run(os.Args[1:], os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}
}
func run(args []string, input io.Reader, output io.Writer) error {
	flags := flag.NewFlagSet("centerify-plugins", flag.ContinueOnError)
	flags.SetOutput(output)
	root := flags.String("root", "", "Centerify project directory (auto-detected)")
	state := flags.String("state", os.Getenv("CENTERIFY_PLUGIN_STATE_DIR"), "Plugin state directory")
	asJSON := flags.Bool("json", false, "Print machine-readable results")
	if err := flags.Parse(args); err != nil {
		return err
	}
	rest := flags.Args()
	if len(rest) > 0 && rest[0] == "version" {
		fmt.Fprintln(output, "Centerify Plugin Marketplace", version)
		return nil
	}
	if *root == "" {
		*root = discoverRoot()
	}
	manager, err := newManager(*root, *state)
	if err != nil {
		return err
	}
	action := "marketplace"
	if len(rest) > 0 {
		action = rest[0]
	} else if terminalInput(input) {
		action = "tui"
	}
	if action == "tui" {
		return fullScreen(manager, input, output)
	}
	id := ""
	if len(rest) > 1 {
		id = rest[1]
	}
	if action == "install" && id == "--path" {
		if len(rest) != 3 {
			return errors.New("usage: install --path FOLDER-OR-ZIP")
		}
		if err := manager.installLocal(rest[2], ""); err != nil {
			return err
		}
		fmt.Fprintln(output, "Local package copied into", filepath.Join(manager.root, "plugins", "installed"), ". Restart Centerify to apply.")
		return nil
	}
	switch action {
	case "marketplace", "installed":
		catalog, err := manager.catalog()
		if err != nil {
			return err
		}
		installed, err := manager.installed()
		if err != nil {
			return err
		}
		if *asJSON {
			if action == "installed" {
				return json.NewEncoder(output).Encode(installed)
			}
			return json.NewEncoder(output).Encode(catalog)
		}
		table := tabwriter.NewWriter(output, 0, 4, 2, ' ', 0)
		fmt.Fprintln(table, "PLUGIN\tVERSION\tSTATE\tNAME")
		if action == "marketplace" {
			for _, entry := range catalog.Plugins {
				if id != "" && !strings.Contains(strings.ToLower(entry.Manifest.ID+" "+entry.Manifest.Name+" "+entry.Manifest.Description), strings.ToLower(id)) {
					continue
				}
				status := "Available"
				if v, ok := installed.Plugins[entry.Manifest.ID]; ok {
					status = "Installed"
					if !v.Enabled {
						status = "Disabled"
					}
				}
				fmt.Fprintf(table, "%s\t%s\t%s\t%s\n", entry.Manifest.ID, entry.Manifest.Version, status, clean(entry.Manifest.Name))
			}
		} else {
			keys := sortedKeys(installed.Plugins)
			for _, key := range keys {
				entry := installed.Plugins[key]
				status := "Enabled"
				if !entry.Enabled {
					status = "Disabled"
				}
				fmt.Fprintf(table, "%s\t%s\t%s\t%s\n", key, entry.Manifest.Version, status, clean(entry.Manifest.Name))
			}
		}
		return table.Flush()
	case "info":
		catalog, err := manager.catalog()
		if err != nil {
			return err
		}
		for _, entry := range catalog.Plugins {
			if entry.Manifest.ID == id {
				encoder := json.NewEncoder(output)
				encoder.SetIndent("", "  ")
				return encoder.Encode(entry)
			}
		}
		return errors.New("plugin is not listed in the marketplace")
	case "install", "update":
		if action == "update" {
			installed, err := manager.installed()
			if err != nil {
				return err
			}
			if _, ok := installed.Plugins[id]; !ok {
				return errors.New("install this plugin before updating it")
			}
		}
		if err := manager.install(id); err != nil {
			return err
		}
	case "enable", "disable":
		if err := manager.setEnabled(id, action == "enable"); err != nil {
			return err
		}
	case "uninstall":
		if len(rest) != 3 || rest[2] != "--confirm" {
			return errors.New("use uninstall PLUGIN --confirm; saved data will be retained")
		}
		if err := manager.uninstall(id); err != nil {
			return err
		}
	case "verify":
		installed, err := manager.installed()
		if err != nil {
			return err
		}
		entry, ok := installed.Plugins[id]
		if !ok {
			return errors.New("plugin is not installed")
		}
		hash, err := packageHash(manager.packagePath(entry.Manifest))
		if err != nil {
			return err
		}
		if hash != entry.SHA256 {
			return errors.New("installed package failed its integrity check")
		}
		fmt.Fprintln(output, id, "integrity verified")
		return nil
	default:
		return errors.New("commands: tui, marketplace [search], installed, info ID, install ID, install --path FOLDER-OR-ZIP, update ID, enable ID, disable ID, verify ID, uninstall ID --confirm, version; options: --root PATH --state PATH --json")
	}
	fmt.Fprintf(output, "%s: %s saved. Restart Centerify to apply. Plugin data is retained.\n", id, action)
	return nil
}
func terminalInput(reader io.Reader) bool {
	file, ok := reader.(*os.File)
	if !ok {
		return false
	}
	info, err := file.Stat()
	return err == nil && info.Mode()&os.ModeCharDevice != 0
}
func clean(value string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return ' '
		}
		return r
	}, value)
}
func sortedKeys[T any](items map[string]T) []string {
	keys := make([]string, 0, len(items))
	for key := range items {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
func discoverRoot() string {
	cwd, _ := os.Getwd()
	exe, _ := os.Executable()
	for _, start := range []string{cwd, filepath.Dir(exe)} {
		for path := start; path != ""; path = filepath.Dir(path) {
			if _, err := os.Stat(filepath.Join(path, "marketplace", "catalog.json")); err == nil {
				return path
			}
			if filepath.Dir(path) == path {
				break
			}
		}
	}
	return cwd
}
