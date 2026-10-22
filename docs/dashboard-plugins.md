# Optional dashboard plugins

No plugins are installed or activated by default. Marketplace presence means a
package is available for review. Global code installation and per-guild activation
are separate, explicit steps.

```sh
# Authorized operator, from the host project directory:
./centerify-plugins.cmd info community-kit
./centerify-plugins.cmd install community-kit
./centerify-plugins.cmd verify community-kit
# Restart the bot, then enable it through Dashboard → Plugins for the desired guild.
```

On Linux/macOS use the native `centerify-plugins` executable; `.cmd` is the Windows
launcher. `update`, `enable`, `disable`, and `uninstall ID --confirm` remain trusted
operator terminal operations. Disabling/uninstalling code requires a restart and
retains saved plugin data. Review capability requests and compatibility before
installation. Never upload or evaluate untrusted scripts in the web application.

The existing version 1 package manifest remains authoritative for identity, version,
entrypoint, dependencies, package hash and permissions. A plugin may additionally
return a typed `dashboard: DashboardExtension` from its SDK factory. Its manifest
uses dashboard API 1; identity/version/dependencies must match the package, and every
capability must also appear in the package's permission list. The host validates
the contract before contributing it to the module registry.

`src/dashboard/extensions.ts` defines the versioned manifest and typed action port:

- Declarative navigation/routes and widgets: bounded text/IDs, rendered by the host.
- Settings: a strict Zod schema, stored per guild with atomic revisions.
- Themes: approved hexadecimal accents, no arbitrary CSS or HTML.
- Builder nodes: named actions with an explicitly declared response capability.
- Actions: receive validated configuration, text and an allowlisted `respond` port.
- Existing module SDK: bot commands, ordered events, services and checks remain
  available through existing module/Discord extension contracts.

The host does not import plugin scripts into browser contexts. Trusted same-process
plugin code can still access its host's privileges; capability declarations are
validation and API boundaries, **not an operating-system security sandbox**.
Failures produce trace/audit information and can be recovered by disabling the guild
activation or disabling the global package and restarting. Integrity failures refuse
startup instead of executing changed package code.

[Community Kit](../plugins/community-kit/README.md) is the separately packaged example:
a dashboard checklist/route/theme and a greeting action. Its source contains no
installation side effects. Build/repackage after editing source:

```sh
npm run build
node scripts/package-plugin.mjs community-kit
```

Packaging refreshes the catalog hash; it does not install the package. Per-guild
activation defaults to absent/disabled. Published workflows using inactive/missing
plugin actions fail validation or execution with a prerequisite explanation.

Ticket providers may additionally return `tickets: TicketDashboardPort`, declaring
`dashboard.tickets`. The host passes a freshly authorized guild/member and the
provider must enforce department staff and channel conversation permissions again.
Better Ticket 1.1.0 implements this port by reusing its existing Runtime actions,
TicketStore locks, transitions, transcripts and recovery. New tags default to empty
for older records; existing profile settings remain authoritative. Older installed
packages continue to work in Discord until an operator explicitly updates them.
