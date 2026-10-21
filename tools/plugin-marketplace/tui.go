package main

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
	"unicode/utf8"
)

type dialog struct {
	title                      string
	lines                      []string
	action, id                 string
	scroll                     int
	path, hash, input, problem string
}
type tui struct {
	manager                       *Manager
	catalog                       Catalog
	installed                     Registry
	view, selected, focus, scroll int
	search                        string
	searching                     bool
	notice                        string
	problem                       bool
	dialog                        *dialog
}

func newTUI(manager *Manager) (*tui, error) {
	ui := &tui{manager: manager, focus: 1, notice: "No plugins install automatically. Changes take effect after the bot restarts."}
	if err := ui.refresh(); err != nil {
		return nil, err
	}
	return ui, nil
}
func (ui *tui) refresh() error {
	catalog, err := ui.manager.catalog()
	if err != nil {
		return err
	}
	installed, err := ui.manager.installed()
	if err != nil {
		return err
	}
	ui.catalog = catalog
	ui.installed = installed
	ui.clamp()
	return nil
}
func (ui *tui) rows() []Listing {
	rows := []Listing{}
	if ui.view == 0 {
		rows = append(rows, ui.catalog.Plugins...)
	} else {
		for _, id := range sortedKeys(ui.installed.Plugins) {
			entry := ui.installed.Plugins[id]
			rows = append(rows, Listing{Manifest: entry.Manifest, SHA256: entry.SHA256})
		}
	}
	if ui.search != "" {
		filtered := []Listing{}
		for _, entry := range rows {
			if strings.Contains(strings.ToLower(entry.Manifest.ID+" "+entry.Manifest.Name+" "+entry.Manifest.Description), strings.ToLower(ui.search)) {
				filtered = append(filtered, entry)
			}
		}
		rows = filtered
	}
	return rows
}
func (ui *tui) clamp() {
	rows := ui.rows()
	if ui.selected >= len(rows) {
		ui.selected = len(rows) - 1
	}
	if ui.selected < 0 {
		ui.selected = 0
	}
	if ui.scroll < 0 {
		ui.scroll = 0
	}
}
func (ui *tui) current() *Listing {
	rows := ui.rows()
	if ui.selected < 0 || ui.selected >= len(rows) {
		return nil
	}
	entry := rows[ui.selected]
	return &entry
}
func (ui *tui) status(id string) string {
	entry, ok := ui.installed.Plugins[id]
	if !ok {
		return "available"
	}
	if entry.Enabled {
		return "enabled"
	}
	return "disabled"
}
func (ui *tui) perform(action, id string) error {
	switch action {
	case "install", "update":
		if action == "update" {
			if _, ok := ui.installed.Plugins[id]; !ok {
				return fmt.Errorf("install %s before updating", id)
			}
		}
		if err := ui.manager.install(id); err != nil {
			return err
		}
	case "enable", "disable":
		if err := ui.manager.setEnabled(id, action == "enable"); err != nil {
			return err
		}
	case "uninstall":
		if err := ui.manager.uninstall(id); err != nil {
			return err
		}
	case "verify":
		entry, ok := ui.installed.Plugins[id]
		if !ok {
			return fmt.Errorf("%s is not installed", id)
		}
		hash, err := packageHash(ui.manager.packagePath(entry.Manifest))
		if err != nil {
			return err
		}
		if hash != entry.SHA256 {
			return fmt.Errorf("%s failed its integrity check", id)
		}
		ui.notice = id + ": integrity verified"
		ui.problem = false
		return nil
	}
	ui.notice = id + ": " + action + " saved. Restart Centerify to apply. Saved data retained."
	ui.problem = false
	return ui.refresh()
}
func (ui *tui) key(key string) bool {
	if key == "ctrl-c" {
		return true
	}
	if ui.dialog != nil {
		if ui.dialog.action == "choose-path" {
			switch key {
			case "esc":
				ui.dialog = nil
			case "backspace":
				runes := []rune(ui.dialog.input)
				if len(runes) > 0 {
					ui.dialog.input = string(runes[:len(runes)-1])
				}
			case "enter":
				_, listing, cleanup, err := prepareLocal(ui.dialog.input)
				cleanup()
				if err != nil {
					ui.dialog.problem = err.Error()
					break
				}
				path := ui.dialog.input
				ui.dialog = &dialog{title: "INSTALL LOCAL " + listing.Manifest.ID, action: "local-install", id: listing.Manifest.ID, path: path, hash: listing.SHA256, lines: []string{listing.Manifest.Name + " " + listing.Manifest.Version, "Source: " + path, "Destination: " + ui.manager.packagePath(listing.Manifest), "", listing.Manifest.Description, "Permissions: " + strings.Join(listing.Manifest.Permissions, ", "), "", "Local code is trusted and will run inside the bot.", "Changes apply after restarting the bot."}}
			default:
				if utf8.RuneCountInString(key) == 1 && len(ui.dialog.input) < 4096 {
					ui.dialog.input += key
					ui.dialog.problem = ""
				}
			}
			return false
		}
		switch key {
		case "down", "j":
			ui.dialog.scroll++
			return false
		case "up", "k":
			if ui.dialog.scroll > 0 {
				ui.dialog.scroll--
			}
			return false
		case "page-down":
			ui.dialog.scroll += 8
			return false
		case "page-up":
			ui.dialog.scroll -= 8
			if ui.dialog.scroll < 0 {
				ui.dialog.scroll = 0
			}
			return false
		}
		if ui.dialog.action == "" {
			if key == "esc" || key == "q" || key == "enter" || key == "?" {
				ui.dialog = nil
			}
			return false
		}
		if key == "y" || key == "Y" {
			pending := ui.dialog
			ui.dialog = nil
			var err error
			if pending.action == "local-install" {
				err = ui.manager.installLocal(pending.path, pending.hash)
				if err == nil {
					ui.notice = pending.id + ": copied into plugins/installed. Restart Centerify to apply."
					ui.problem = false
					err = ui.refresh()
				}
			} else {
				err = ui.perform(pending.action, pending.id)
			}
			if err != nil {
				ui.notice = err.Error()
				ui.problem = true
			}
		} else if key == "n" || key == "N" || key == "esc" {
			ui.dialog = nil
			ui.notice = "Cancelled."
			ui.problem = false
		}
		return false
	}
	if ui.searching {
		switch key {
		case "enter", "esc":
			ui.searching = false
		case "backspace":
			runes := []rune(ui.search)
			if len(runes) > 0 {
				ui.search = string(runes[:len(runes)-1])
			}
		default:
			if utf8.RuneCountInString(key) == 1 && len(ui.search) < 200 {
				ui.search += key
			}
		}
		ui.selected = 0
		ui.scroll = 0
		ui.clamp()
		return false
	}
	switch key {
	case "q":
		return true
	case "/":
		ui.searching = true
	case "a":
		ui.dialog = &dialog{title: "Install from local path", action: "choose-path"}
	case "esc":
		ui.search = ""
		ui.selected = 0
		ui.scroll = 0
	case "tab", "right", "l":
		ui.focus = (ui.focus + 1) % 3
	case "shift-tab", "left", "h":
		ui.focus = (ui.focus + 2) % 3
	case "1":
		ui.view = 0
		ui.selected = 0
		ui.scroll = 0
	case "2":
		ui.view = 1
		ui.selected = 0
		ui.scroll = 0
	case "j", "down":
		if ui.focus == 0 {
			ui.view = 1
			ui.selected = 0
		} else if ui.focus == 1 {
			ui.selected++
			ui.scroll = 0
		} else {
			ui.scroll++
		}
	case "k", "up":
		if ui.focus == 0 {
			ui.view = 0
			ui.selected = 0
		} else if ui.focus == 1 {
			ui.selected--
			ui.scroll = 0
		} else {
			ui.scroll--
		}
	case "home":
		ui.selected = 0
		ui.scroll = 0
	case "end":
		ui.selected = len(ui.rows()) - 1
	case "page-down":
		if ui.focus == 2 {
			ui.scroll += 8
		} else {
			ui.selected += 8
		}
	case "page-up":
		if ui.focus == 2 {
			ui.scroll -= 8
		} else {
			ui.selected -= 8
		}
	case "enter":
		ui.focus = 2
	case "r":
		if err := ui.refresh(); err != nil {
			ui.notice = err.Error()
			ui.problem = true
		} else {
			ui.notice = "Marketplace and installed state refreshed."
			ui.problem = false
		}
	case "?":
		ui.dialog = &dialog{title: "Keyboard shortcuts", lines: []string{"Tab / Shift+Tab   Move between panels", "h / l or Left / Right   Move panel focus", "j / k or Up / Down   Select or scroll", "1 Marketplace   2 Installed   / Search", "Enter   Focus package details", "i Install   u Update   e Enable/disable", "a Install from folder / plugin.json / ZIP path", "d Uninstall (keep data)   v Verify", "r Refresh   Esc Clear search / cancel", "q Quit   Ctrl+C Quit"}}
	case "i", "u", "e", "d", "v":
		entry := ui.current()
		if entry == nil {
			ui.notice = "Select a plugin first."
			ui.problem = true
			break
		}
		action := map[string]string{"i": "install", "u": "update", "d": "uninstall", "v": "verify"}[key]
		if key == "e" {
			old, ok := ui.installed.Plugins[entry.Manifest.ID]
			if !ok {
				ui.notice = "Install this plugin before enabling it."
				ui.problem = true
				break
			}
			action = "enable"
			if old.Enabled {
				action = "disable"
			}
		}
		if action == "verify" {
			if err := ui.perform(action, entry.Manifest.ID); err != nil {
				ui.notice = err.Error()
				ui.problem = true
			}
			break
		}
		if (action == "uninstall" || action == "update") && ui.status(entry.Manifest.ID) == "available" {
			ui.notice = "Install this plugin first."
			ui.problem = true
			break
		}
		if action == "install" || action == "update" {
			var release *Listing
			for _, candidate := range ui.catalog.Plugins {
				if candidate.Manifest.ID == entry.Manifest.ID {
					value := candidate
					release = &value
					break
				}
			}
			if release == nil {
				ui.notice = "This plugin is no longer listed in the marketplace."
				ui.problem = true
				break
			}
			entry = release
		}
		lines := []string{entry.Manifest.Name + " " + entry.Manifest.Version, "", "Changes take effect after restarting the bot.", "Saved settings and ticket data are retained."}
		if action == "install" || action == "update" {
			lines = append(lines, "", "Plugins execute trusted code inside the bot.", "Permissions: "+strings.Join(entry.Manifest.Permissions, ", "))
		}
		ui.dialog = &dialog{title: strings.ToUpper(action) + " " + entry.Manifest.ID, lines: lines, action: action, id: entry.Manifest.ID}
	}
	ui.clamp()
	return false
}

type cell struct {
	r     rune
	color int
}
type canvas struct {
	w, h  int
	cells [][]cell
}

func newCanvas(w, h int) *canvas {
	c := &canvas{w: w, h: h, cells: make([][]cell, h)}
	for y := range c.cells {
		c.cells[y] = make([]cell, w)
		for x := range c.cells[y] {
			c.cells[y][x] = cell{' ', 0}
		}
	}
	return c
}
func (c *canvas) put(x, y int, text string, color int) {
	if y < 0 || y >= c.h {
		return
	}
	for _, r := range clean(text) {
		if x >= c.w {
			break
		}
		if x >= 0 {
			c.cells[y][x] = cell{r, color}
		}
		x++
	}
}
func (c *canvas) box(x, y, w, h int, title string, focused bool) {
	color := 3
	if focused {
		color = 1
	}
	if w < 2 || h < 2 {
		return
	}
	for i := 0; i < w; i++ {
		c.put(x+i, y, "─", color)
		c.put(x+i, y+h-1, "─", color)
	}
	for i := 0; i < h; i++ {
		c.put(x, y+i, "│", color)
		c.put(x+w-1, y+i, "│", color)
	}
	c.put(x, y, "╭", color)
	c.put(x+w-1, y, "╮", color)
	c.put(x, y+h-1, "╰", color)
	c.put(x+w-1, y+h-1, "╯", color)
	c.put(x+2, y, " "+crop(title, w-5)+" ", color)
}
func crop(text string, width int) string {
	if width <= 0 {
		return ""
	}
	runes := []rune(clean(text))
	if len(runes) > width {
		if width == 1 {
			return "…"
		}
		return string(runes[:width-1]) + "…"
	}
	return string(runes)
}
func wrap(text string, width int) []string {
	if width < 1 {
		return nil
	}
	words := strings.Fields(clean(text))
	lines := []string{}
	line := ""
	for _, word := range words {
		for len([]rune(word)) > width {
			if line != "" {
				lines = append(lines, line)
				line = ""
			}
			runes := []rune(word)
			lines = append(lines, string(runes[:width]))
			word = string(runes[width:])
		}
		if word == "" {
			continue
		}
		if len([]rune(line))+len([]rune(word))+1 > width && line != "" {
			lines = append(lines, line)
			line = word
		} else {
			if line != "" {
				line += " "
			}
			line += word
		}
	}
	if line != "" {
		lines = append(lines, line)
	}
	if len(lines) == 0 {
		return []string{""}
	}
	return lines
}
func (c *canvas) render() string {
	palette := []string{"\x1b[0;37m", "\x1b[1;36m", "\x1b[30;46m", "\x1b[0;90m", "\x1b[1;32m", "\x1b[1;33m", "\x1b[1;31m"}
	var out strings.Builder
	out.WriteString("\x1b[H")
	last := -1
	for y, row := range c.cells {
		for _, item := range row {
			if item.color != last {
				out.WriteString(palette[item.color])
				last = item.color
			}
			out.WriteRune(item.r)
		}
		if y < c.h-1 {
			out.WriteString("\r\n")
		}
	}
	out.WriteString("\x1b[0m")
	return out.String()
}
func (ui *tui) render(width, height int) string {
	if width < 1 {
		width = 1
	}
	if height < 1 {
		height = 1
	}
	if width > 240 {
		width = 240
	}
	if height > 90 {
		height = 90
	}
	c := newCanvas(width, height)
	c.put(1, 0, "CENTERIFY  /  Plugin Marketplace", 1)
	c.put(width-24, 0, "native · offline catalog", 3)
	if width < 78 || height < 22 {
		c.put(2, 3, "Resize to at least 78 columns × 22 rows.", 5)
		c.put(2, 5, "q Quit    Ctrl+C Quit", 0)
		return c.render()
	}
	bodyHeight := height - 6
	left := 18
	listWidth := width * 34 / 100
	if listWidth < 26 {
		listWidth = 26
	}
	detailX := left + listWidth
	detailWidth := width - detailX
	c.box(0, 2, left, bodyHeight, "Views", ui.focus == 0)
	c.box(left, 2, listWidth, bodyHeight, "Plugins", ui.focus == 1)
	c.box(detailX, 2, detailWidth, bodyHeight, "Details", ui.focus == 2)
	for i, label := range []string{"1 Marketplace", "2 Installed"} {
		color := 0
		if i == ui.view {
			color = 2
		}
		c.put(2, 4+i*2, crop(label, left-4), color)
	}
	c.put(2, 10, "? Shortcuts", 3)
	c.put(2, 12, "Local catalog", 3)
	c.put(2, 13, fmt.Sprintf("%d listed", len(ui.catalog.Plugins)), 3)
	c.put(2, 14, fmt.Sprintf("%d installed", len(ui.installed.Plugins)), 3)
	rows := ui.rows()
	visible := bodyHeight - 3
	start := 0
	if ui.selected >= visible {
		start = ui.selected - visible + 1
	}
	for i := start; i < len(rows) && i < start+visible; i++ {
		entry := rows[i]
		color := 0
		if i == ui.selected {
			color = 2
		}
		c.put(left+2, 4+i-start, crop(entry.Manifest.ID+"  ["+ui.status(entry.Manifest.ID)+"]", listWidth-4), color)
	}
	if len(rows) == 0 {
		c.put(left+2, 5, crop("No matching plugins", listWidth-4), 3)
	}
	details := []string{"Choose a plugin to inspect its manifest."}
	if entry := ui.current(); entry != nil {
		m := entry.Manifest
		details = []string{m.Name, "Version: " + m.Version, "Status: " + ui.status(m.ID), "API: 1", "", m.Description, "", "Requested permissions:"}
		for _, permission := range m.Permissions {
			details = append(details, "• "+permission)
		}
		details = append(details, "", "Dependencies: "+strings.Join(m.Dependencies, ", "), "", "Changes apply after a bot restart.", "Package code is trusted, not sandboxed.")
	}
	lines := []string{}
	for _, line := range details {
		lines = append(lines, wrap(line, detailWidth-4)...)
	}
	maxScroll := len(lines) - visible
	if maxScroll < 0 {
		maxScroll = 0
	}
	if ui.scroll > maxScroll {
		ui.scroll = maxScroll
	}
	for i := ui.scroll; i < len(lines) && i < ui.scroll+visible; i++ {
		color := 0
		if i == 0 {
			color = 1
		}
		c.put(detailX+2, 4+i-ui.scroll, lines[i], color)
	}
	search := "/ Search: " + ui.search
	if ui.searching {
		search += "▏  Enter apply · Esc finish"
	}
	c.put(1, height-3, crop(search, width-2), 5)
	color := 3
	if ui.problem {
		color = 6
	}
	c.put(1, height-2, crop(ui.notice, width-2), color)
	c.put(1, height-1, crop("a Local path  i Install  u Update  e Toggle  d Remove  v Verify  / Search  ? Help  q Quit", width-2), 1)
	if ui.dialog != nil {
		w := width - 14
		if w > 88 {
			w = 88
		}
		content := ui.dialog.lines
		if ui.dialog.action == "choose-path" {
			content = []string{"Paste a folder, plugin.json file, or ZIP file path:", "", ui.dialog.input + "▏", "", ui.dialog.problem}
		}
		lines := []string{}
		for _, line := range content {
			lines = append(lines, wrap(line, w-6)...)
		}
		h := len(lines) + 5
		if h > height-4 {
			h = height - 4
		}
		x, y := (width-w)/2, (height-h)/2
		for yy := y; yy < y+h; yy++ {
			c.put(x, yy, strings.Repeat(" ", w), 0)
		}
		c.box(x, y, w, h, ui.dialog.title, true)
		visible := h - 5
		maxScroll := len(lines) - visible
		if maxScroll < 0 {
			maxScroll = 0
		}
		if ui.dialog.scroll > maxScroll {
			ui.dialog.scroll = maxScroll
		}
		for i, line := range lines[ui.dialog.scroll:] {
			if i >= visible {
				break
			}
			c.put(x+3, y+2+i, crop(line, w-6), 0)
		}
		footer := "Enter / Esc Close"
		if ui.dialog.action != "" {
			footer = "Y Confirm   N / Esc Cancel"
		}
		if ui.dialog.action == "choose-path" {
			footer = "Enter Inspect   Esc Cancel"
		}
		if maxScroll > 0 {
			footer += "   ↑↓ scroll"
		}
		c.put(x+3, y+h-2, crop(footer, w-6), 5)
	}
	return c.render()
}

type keyDecoder struct {
	pending string
	since   time.Time
}

var escapeKeys = map[string]string{"\x1b[A": "up", "\x1b[B": "down", "\x1b[C": "right", "\x1b[D": "left", "\x1b[Z": "shift-tab", "\x1b[H": "home", "\x1b[F": "end", "\x1b[5~": "page-up", "\x1b[6~": "page-down"}

func (d *keyDecoder) feed(r rune) []string {
	if d.pending != "" {
		if d.pending == "\x1b" && r != '[' && r != 'O' {
			d.pending = ""
			return append([]string{"esc"}, d.feed(r)...)
		}
		d.pending += string(r)
		if key, ok := escapeKeys[d.pending]; ok {
			d.pending = ""
			return []string{key}
		}
		for sequence := range escapeKeys {
			if strings.HasPrefix(sequence, d.pending) {
				return nil
			}
		}
		d.pending = ""
		return nil
	}
	switch r {
	case 27:
		d.pending = "\x1b"
		d.since = time.Now()
		return nil
	case 3, 4:
		return []string{"ctrl-c"}
	case 9:
		return []string{"tab"}
	case 10, 13:
		return []string{"enter"}
	case 8, 127:
		return []string{"backspace"}
	default:
		if r >= 32 {
			return []string{string(r)}
		}
	}
	return nil
}
func (d *keyDecoder) flush() []string {
	if d.pending != "" && time.Since(d.since) > 80*time.Millisecond {
		d.pending = ""
		return []string{"esc"}
	}
	return nil
}
func fullScreen(manager *Manager, input io.Reader, output io.Writer) error {
	in, ok := input.(*os.File)
	if !ok || !terminalInput(input) {
		return fmt.Errorf("the full-screen TUI requires a terminal; use CLI commands for scripted input")
	}
	out, ok := output.(*os.File)
	if !ok {
		return fmt.Errorf("the TUI needs terminal output")
	}
	ui, err := newTUI(manager)
	if err != nil {
		return err
	}
	restore, err := rawTerminal(in, out)
	if err != nil {
		return err
	}
	defer restore()
	fmt.Fprint(out, "\x1b[?1049h\x1b[?25l\x1b[?7l\x1b[2J")
	defer fmt.Fprint(out, "\x1b[0m\x1b[?7h\x1b[?25h\x1b[?1049l")
	keys := make(chan rune, 32)
	readErrors := make(chan error, 1)
	go func() {
		reader := bufio.NewReader(in)
		for {
			r, _, err := reader.ReadRune()
			if err != nil {
				readErrors <- err
				return
			}
			keys <- r
		}
	}()
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	stopping := make(chan os.Signal, 1)
	signal.Notify(stopping, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(stopping)
	decoder := keyDecoder{}
	w, h := terminalSize(out)
	fmt.Fprint(out, ui.render(w, h))
	for {
		changed := false
		var events []string
		select {
		case <-stopping:
			return nil
		case r := <-keys:
			events = decoder.feed(r)
		case err := <-readErrors:
			if err == io.EOF {
				return nil
			}
			return err
		case <-ticker.C:
			events = decoder.flush()
			width, height := terminalSize(out)
			if width != w || height != h {
				w, h = width, height
				changed = true
			}
		}
		for _, key := range events {
			if ui.key(key) {
				return nil
			}
			changed = true
		}
		if changed {
			fmt.Fprint(out, ui.render(w, h))
		}
	}
}
