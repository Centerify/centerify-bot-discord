# Documentation

Operational and contributor guides for Centerify. Start with the
[repository README](../README.md) for installation and Discord application setup.

## Deploy and operate

- [Production deployment](deployment.md): Compose startup, migrations, upgrades,
  health checks, resource limits, backups, restoration, and troubleshooting.
- [Configuration and development](configuration.md): environment and JSON
  configuration, module selection, package choices, and quality commands.
- [Database workflow](../prisma-next.md): contracts, generated files, and migration review.
- [Security](security.md): authorization boundaries and deployment responsibilities.

## Configure your servers

- [Server settings](server-settings.md): owner verification, warnings, command access, and XP.
- [Management and tickets](management.md): server, channel, role, and ticket commands.
- [Custom commands](custom-commands.md): templates, sharing, permissions, and import/export.
- [Plugins](plugins.md): installation, trust, packaging, and container operations.
- [Better Ticket](../plugins/better-ticket/README.md): optional department-based support.
- [Web dashboard](dashboard.md): setup, OAuth, demo mode and module-to-page mapping.
- [Dashboard deployment](dashboard-deployment.md): optional Compose, proxying and recovery.
- [Dashboard permissions and events](dashboard-security.md): authorization, audit and SSE.
- [Command builder](dashboard-workflows.md): validated workflows, tests and runtime limits.
- [Dashboard plugins](dashboard-plugins.md): explicit installation and extension contracts.

## Extend and contribute

- [Architecture](architecture.md): dependency direction, module composition, and lifecycle.
- [Creating a module](creating-a-module.md): business module, Discord adapter, and tests.
- [Contributing](../CONTRIBUTING.md): development workflow and pull request expectations.
- [Vulnerability reporting](../SECURITY.md): private reporting and credential handling.

Commands in fenced `sh` blocks use a POSIX shell. On PowerShell, use `Copy-Item`
to copy environment files and `$env:TEST_DATABASE_URL = 'postgresql://...'` before
running database tests. Docker Compose commands work in both shells. Example
credentials are placeholders; configure real values outside version control.
