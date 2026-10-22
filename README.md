# Centerify

[![CI](https://github.com/Centerify/centerify-bot-discord/actions/workflows/ci.yml/badge.svg)](https://github.com/Centerify/centerify-bot-discord/actions/workflows/ci.yml)
[![Plugin installer](https://github.com/Centerify/centerify-bot-discord/actions/workflows/plugin-installer.yml/badge.svg)](https://github.com/Centerify/centerify-bot-discord/actions/workflows/plugin-installer.yml)

A modular Discord bot for server management, moderation, support tickets, XP,
and custom commands. Built with TypeScript, Discord.js, Sapphire, PostgreSQL,
and Prisma 8 / Prisma Next.

## Features

- Per-server configuration and current-owner verification.
- Moderation cases, timed warnings, warning roles, reports, and opt-in global moderation.
- Server, channel, and role management with permission and hierarchy checks.
- Private support tickets with persistent panels and retained channel history.
- Message, reaction, and daily XP with local, global, or selected-server leaderboards.
- Custom message commands, interactive responses, and member join/leave rules.
- Optional trusted plugins, a native terminal marketplace, and Better Ticket.
- Configurable identity, presence, commands, logging, and module selection.
- Production containers with database migrations, readiness checks, and graceful shutdown.
- An optional Next.js dashboard with Discord sign-in, live views, safe workflow building,
  and explicitly installed plugins. No plugins are installed or activated by default.

## Web dashboard

See the [dashboard guide](docs/dashboard.md) for OAuth setup, demo mode, permissions,
feature coverage, workflow building and validation. Install its dependencies with
`npm ci --prefix dashboard`, then use `npm run dashboard:dev` or
`npm run dashboard:build` / `npm run dashboard:start`. The root launcher preserves
the existing `--config` and `--env-file` options.

The [optional deployment override](docs/dashboard-deployment.md) adds the web service
without changing bot-only startup. Plugins remain available catalog packages until
an operator installs them and a server administrator enables their features.

## Quick start with Docker Compose

Install Docker Engine or Docker Desktop with **Linux containers** and Compose
**2.20+**. Node.js and PostgreSQL on the host are unnecessary for this path.

```sh
git clone https://github.com/Centerify/centerify-bot-discord.git
cd centerify-bot-discord
cp .env.compose.example .env.compose
```

On PowerShell, use `Copy-Item .env.compose.example .env.compose` instead of `cp`.
Fill in `DISCORD_TOKEN` and two different, randomly generated hexadecimal passwords
in `.env.compose`. Protect that file; it contains deployment credentials. Customize
[`centerify.config.json`](centerify.config.json) before starting.

```sh
docker compose --env-file .env.compose config --quiet
docker compose --env-file .env.compose up --build --detach --wait --wait-timeout 180
docker compose --env-file .env.compose ps --all
docker compose --env-file .env.compose logs --tail 100 bot
```

Compose starts PostgreSQL, applies the committed migrations in a separate job,
then starts one bot process. Database and plugin data persist in Docker volumes.
No host ports are published. See the [deployment guide](docs/deployment.md) for
upgrades, backups, restoration, plugin administration, and troubleshooting.

## Discord setup

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications)
   and put its bot token in your environment file.
2. Enable **Server Members Intent**, **Presence Intent**, and **Message Content
   Intent** on the application's Bot page. Centerify requests all three.
3. Invite the application with the `bot` and `applications.commands` scopes.
   Grant permissions for the features you enable; place the bot's role above
   roles it assigns and members it moderates.
4. The current owner of **each** server must run `/verify`, then `/setup` or
   `/settings`. Administrator permission alone does not authorize Centerify.

Ownership changes require verification by the new owner. `/unverify` revokes
authorization. XP sharing and global moderation require explicit configuration.
See [server settings](docs/server-settings.md) and [management and tickets](docs/management.md).

## Local development

Requires **Node.js 24**, npm, and a dedicated **PostgreSQL 15+** database.

```sh
npm ci
cp .env.example .env
# Set DISCORD_TOKEN and DATABASE_URL in .env before continuing.
npm run check:config
npx prisma db migrate
npm run dev
```

Use `Copy-Item .env.example .env` on PowerShell. Configuration validation is
offline; migrations need a reachable database. Never use a production database
for integration tests. [Configuration](docs/configuration.md) covers environment
precedence, customization, and module selection.

| Command                       | Purpose                                                    |
| ----------------------------- | ---------------------------------------------------------- |
| `npm run dev`                 | Compile and restart on source changes                      |
| `npm run check`               | Formatting, lint, types, tests, and production build       |
| `npm run build` / `npm start` | Build / run compiled application code                      |
| `npm run check:config`        | Validate configuration without connecting to services      |
| `npm run test:database`       | Integration tests against a migrated test database         |
| `npm run test:e2e`            | Sharing workflows; requires `TEST_DATABASE_URL` explicitly |
| `npm run check:discord`       | Read-only live connectivity and registration check         |
| `npm run audit:production`    | Audit runtime dependencies                                 |
| `npm run contract:emit`       | Regenerate committed Prisma contract artifacts             |

`test:database` falls back to `DATABASE_URL` from `.env` when `TEST_DATABASE_URL`
is absent. Set `TEST_DATABASE_URL` explicitly to isolate tests. The Discord check
requires a built application already registered in at least two servers; it does
not test command execution or publish commands.

## Documentation

Start with the [documentation index](docs/README.md).

| Guide                                            | Contents                                                        |
| ------------------------------------------------ | --------------------------------------------------------------- |
| [Deployment](docs/deployment.md)                 | Compose, releases, monitoring, backup, and recovery             |
| [Configuration](docs/configuration.md)           | Environment, JSON settings, modules, and development            |
| [Server settings](docs/server-settings.md)       | Verification, warnings, command access, and XP                  |
| [Management](docs/management.md)                 | Server, channel, role, and built-in ticket commands             |
| [Custom commands](docs/custom-commands.md)       | Templates, permissions, sharing, and import/export              |
| [Plugins](docs/plugins.md)                       | Native marketplace, container administration, and package trust |
| [Better Ticket](plugins/better-ticket/README.md) | Optional support workflow and retention limits                  |
| [Architecture](docs/architecture.md)             | Module boundaries, composition, and lifecycle                   |
| [Creating a module](docs/creating-a-module.md)   | Extension example and test workflow                             |
| [Database](prisma-next.md)                       | Prisma contract and migration workflow                          |
| [Security](docs/security.md)                     | Authorization, dependency checks, and operating limits          |

## Contributing and support

Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes. Use
[GitHub Issues](https://github.com/Centerify/centerify-bot-discord/issues) for
reproducible bugs and feature requests. Follow [SECURITY.md](SECURITY.md) for
vulnerability reporting; keep tokens and private server data out of reports.

Centerify currently uses a Prisma Next release candidate. Review and validate
toolchain upgrades before production rollout. Run one process per Discord
application; process-local locks and cooldowns do not provide multi-instance coordination.

## License

[ISC](LICENSE).
