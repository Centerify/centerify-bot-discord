package main

import (
	"regexp"
	"strings"
	"testing"
	"time"
	"unicode/utf8"
)

func TestTUILifecycleConfirmations(t *testing.T) {
	f := setup(t)
	ui, err := newTUI(f.manager)
	if err != nil {
		t.Fatal(err)
	}
	ui.key("i")
	if ui.dialog == nil || ui.dialog.action != "install" {
		t.Fatal("install needs a dialog")
	}
	before, _ := f.manager.installed()
	if len(before.Plugins) != 0 {
		t.Fatal("opening a dialog installed a plugin")
	}
	ui.key("n")
	ui.key("i")
	ui.key("y")
	if ui.problem || ui.status("example") != "enabled" {
		t.Fatal(ui.notice)
	}
	ui.key("v")
	if ui.problem || !strings.Contains(ui.notice, "verified") {
		t.Fatal(ui.notice)
	}
	ui.key("e")
	ui.key("y")
	if ui.status("example") != "disabled" {
		t.Fatal(ui.notice)
	}
	ui.key("e")
	ui.key("esc")
	if ui.status("example") != "disabled" {
		t.Fatal("cancel changed state")
	}
	ui.key("2")
	if len(ui.rows()) != 1 {
		t.Fatal("installed view is empty")
	}
	ui.key("d")
	ui.key("y")
	if ui.problem || len(ui.rows()) != 0 {
		t.Fatal(ui.notice)
	}
}

func TestTUISearchNavigationAndRendering(t *testing.T) {
	f := setup(t)
	ui, err := newTUI(f.manager)
	if err != nil {
		t.Fatal(err)
	}
	ui.key("tab")
	if ui.focus != 2 {
		t.Fatal("tab did not focus details")
	}
	ui.key("shift-tab")
	ui.key("/")
	for _, r := range "missing" {
		ui.key(string(r))
	}
	ui.key("enter")
	if len(ui.rows()) != 0 {
		t.Fatal("search did not filter")
	}
	ui.key("i")
	if ui.dialog != nil || !ui.problem {
		t.Fatal("empty selection can install")
	}
	ui.key("esc")
	if len(ui.rows()) != 1 {
		t.Fatal("escape did not clear search")
	}
	ui.key("end")
	ui.key("down")
	if ui.selected != 0 {
		t.Fatal("selection out of range")
	}
	ui.key("i")
	// Keep the confirmation visible even when permissions wrap beyond the dialog.
	ui.dialog.lines = append(ui.dialog.lines, strings.Repeat("Long permission ", 100))
	ansi := regexp.MustCompile(`\x1b\[[0-9;]*[A-Za-z]`)
	for _, dimensions := range [][2]int{{78, 22}, {120, 35}, {45, 15}} {
		screen := ansi.ReplaceAllString(ui.render(dimensions[0], dimensions[1]), "")
		lines := strings.Split(screen, "\r\n")
		if len(lines) != dimensions[1] {
			t.Fatal("incorrect frame height")
		}
		for _, line := range lines {
			if utf8.RuneCountInString(line) != dimensions[0] {
				t.Fatal("incorrect frame width")
			}
		}
		if dimensions[0] >= 78 && !strings.Contains(screen, "Y Confirm") {
			t.Fatal("confirmation hidden")
		}
	}
	ui.key("esc")
	ui.key("?")
	if ui.dialog == nil {
		t.Fatal("missing help")
	}
	ui.key("enter")
	if ui.dialog != nil || !ui.key("q") {
		t.Fatal("close or quit failed")
	}
}

func TestTUIDecodesKeysAndStandaloneEscape(t *testing.T) {
	decoder := keyDecoder{}
	for sequence, want := range escapeKeys {
		var keys []string
		for _, r := range sequence {
			keys = append(keys, decoder.feed(r)...)
		}
		if len(keys) != 1 || keys[0] != want {
			t.Fatalf("%q: %v", sequence, keys)
		}
	}
	decoder.feed(27)
	decoder.since = time.Now().Add(-time.Second)
	if keys := decoder.flush(); len(keys) != 1 || keys[0] != "esc" {
		t.Fatal(keys)
	}
	if keys := decoder.feed(3); len(keys) != 1 || keys[0] != "ctrl-c" {
		t.Fatal(keys)
	}
}
