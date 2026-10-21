# Native plugin marketplace and installer

The installer is a standalone Go executable using the standard library only.
It has no third-party packages or runtime installation requirement. The bot
continues to use Node.js. There are no Discord plugin installation commands.

## Full-screen TUI

| System              | Executable inside `artifacts/plugin-installer/` |
| ------------------- | ----------------------------------------------- |
| Windows x64         | `windows-amd64/centerify-plugins.exe`           |
| Windows ARM64       | `windows-arm64/centerify-plugins.exe`           |
| macOS Intel         | `darwin-amd64/centerify-plugins`                |
| macOS Apple Silicon | `darwin-arm64/centerify-plugins`                |
| Linux x64           | `linux-amd64/centerify-plugins`                 |
| Linux ARM64         | `linux-arm64/centerify-plugins`                 |

Windows users can run `centerify-plugins.cmd tui` from the project root.
On another system, run its matching binary with `tui`, for example:

```sh
./artifacts/plugin-installer/linux-amd64/centerify-plugins tui
```

The full-screen interface uses a lazygit-style layout with Views, Plugins and
Details panels, colored selection, search, and confirmation dialogs. It uses
native terminal APIs and no terminal UI library. A terminal of at least 78 × 22
is required; resizing is detected automatically. Running the executable without
arguments opens the TUI in a terminal and lists the marketplace when piped.

| Keys                                 | Action                                        |
| ------------------------------------ | --------------------------------------------- |
| Tab / Shift+Tab, Left / Right, h / l | Move between panels                           |
| Up / Down, k / j                     | Select plugins or scroll details              |
| 1 / 2                                | Marketplace / installed view                  |
| /, Enter, Esc                        | Search, finish search, clear search           |
| i / u                                | Install / update selected plugin              |
| e / d                                | Enable or disable / uninstall, retaining data |
| v / r                                | Verify package / refresh listings             |
| ? / q                                | Keyboard help / quit                          |

Changes require Y to confirm in the dialog; N or Esc cancels. Ctrl+C exits and
restores the terminal. CLI commands remain available for automation.

Press **a** to install a local package. Paste a folder, `plugin.json`, or ZIP
file path, press Enter to inspect it, then Y to copy and install. The dialog
shows its identity, permissions and destination; arrow keys scroll long details.

## CLI

Use the matching native executable in place of `centerify-plugins` below:

```text
centerify-plugins marketplace
centerify-plugins marketplace ticket
centerify-plugins info better-ticket
centerify-plugins install better-ticket
centerify-plugins install --path "C:\Downloads\better-ticket.zip"
centerify-plugins install --path "/home/me/plugins/better-ticket/package"
centerify-plugins installed
centerify-plugins verify better-ticket
centerify-plugins disable better-ticket
centerify-plugins enable better-ticket
centerify-plugins update better-ticket
centerify-plugins uninstall better-ticket --confirm
```

Global options go before the command:

```text
centerify-plugins --root /path/to/Centerify --state /path/to/plugin-state --json installed
```

The project root is auto-detected from `marketplace/catalog.json`. State defaults
to `CENTERIFY_PLUGIN_STATE_DIR`, then `<project>/.centerify`. Configure the same
directory for the bot. Back it up along with `plugins/installed/`, and persist
both directories in containers. Installed code always lives in the project's
plugins folder; `--state` selects the registry and data location.

Changes apply after restarting the bot. A fresh checkout has an empty installed
registry: listings never install themselves. Only installed, enabled plugins
load at startup. For this task, Better Ticket is explicitly installed through
the native CLI after packaging.

Uninstall removes the registry entry. Data and versioned code are retained so
running work can finish and reinstalling can recover settings. Stop the bot
before manually clearing retained packages or data. Disabling pauses plugin
background work after restart.

## Packages and trust

```text
marketplace/catalog.json          curated listings and SHA-256 digests
plugins/better-ticket/            separate plugin project
  plugin.json                    manifest
  src/                           TypeScript source
  package/                       distributable JavaScript and manifest
.centerify/installed.json         local registry (not committed)
plugins/installed/<id>/<ver>/     immutable installed copies (not committed)
.centerify/data/<id>/<guild>.json isolated persistent data
```

This is a local, curated marketplace with optional local-path imports. There is
no remote marketplace service or arbitrary URL installer. Operators can publish
vetted packages into the catalog or install a package directly from disk.
Plugins run trusted JavaScript inside the bot process; declared permissions are
informational, not a sandbox. Checksums verify consistency with the operator's
catalog, not publisher identity.

Local paths accept a package folder, its `plugin.json` file, a developer folder
with a built `package/` subfolder, or a ZIP containing the package at its root
or under one enclosing directory. Raw JavaScript files require a manifest and
are not standalone packages. Local imports do not change the marketplace catalog.
ZIP imports reject unsafe paths, duplicate names, links, special files and
packages exceeding 200 files or 20 MiB after extraction (24 MiB archive limit).
The installer rechecks the inspected hash before confirming a TUI install.

The installer checks manifest identity, API compatibility, dependencies, cycles,
checksums, immutable versions, traversal, links, file count and package size.
Packages are staged and checked before an atomic registry write. Native OS
locks serialize registry changes. The bot checks integrity before importing.

Plugins export a factory returning their own `CenterifyModule` and Discord
contributions. Better Ticket is not in the built-in composition list. The SDK
injects Discord, Sapphire, validation, authorization, logging and isolated
storage. Per-server storage updates run synchronously under a file lock,
are saved atomically and are capped at 8 MiB.

## Build and publish

Building requires Go 1.24 or newer. Running the outputs requires no Go runtime.

```sh
cd tools/plugin-marketplace
go test ./...
go run build.go
```

The build cross-compiles all six targets with cgo disabled and debug symbols
removed, then emits `SHA256SUMS`. No third-party Go modules are fetched. CI is
configured to run native tests on Windows, macOS and Linux and upload binaries.
Locally, Windows execution was checked; the other builds still need native CI
execution before release.

Publish the separate plugin source with:

```sh
npm run typecheck
npm run build
node scripts/package-plugin.mjs better-ticket
```

Packaging emits JavaScript and updates the catalog. It does not install. Use
the native install command next, then restart the bot. Increment the manifest
and module version together before publishing changed package contents.

See [Better Ticket](../plugins/better-ticket/README.md) for support workflows.
