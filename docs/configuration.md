# Configuration and development

[Documentation](README.md) · [Deployment](deployment.md) · [Server settings](server-settings.md)

Use Node.js 24 LTS, as specified in `.nvmrc` and `package.json`. Install with
`npm ci` so the lockfile controls the exact dependency tree.

For production containers, start with [Docker Compose](deployment.md#first-installation).
`.env.example` is for local Node deployments; `.env.compose.example` contains the
separate variables used by the bundled PostgreSQL stack. Compose constructs
`DATABASE_URL` and injects credentials; it does not load the host's `.env` into
the bot. Include `--env-file .env.compose` in Compose commands.

## First run

Copy `.env.example` to `.env`, set the bot token and PostgreSQL connection string,
then run:

```sh
npm ci
npm run check:config
npx prisma db migrate
npm run dev
```

The configuration checker validates locally and prints no credentials. It does
not connect to Discord or PostgreSQL. Startup performs the same checks before
loading their adapters. Database migrations still require a reachable database.

| Variable                     | Default                                  | Meaning                                                        |
| ---------------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| `DISCORD_TOKEN`              | required                                 | Bot token from the Discord Developer Portal                    |
| `DATABASE_URL`               | required                                 | `postgresql://user:password@host:5432/database`                |
| `NODE_ENV`                   | `development`                            | `development`, `test` or `production`                          |
| `LOG_LEVEL`                  | `info`                                   | `trace`, `debug`, `info`, `warn`, `error`, `fatal` or `silent` |
| `LOG_FORMAT`                 | `json` in production; `pretty` otherwise | Structured logs or readable development logs                   |
| `SHUTDOWN_TIMEOUT_MS`        | `10000`                                  | Cleanup deadline; integer from 1000 through 120000             |
| `CENTERIFY_MODULES`          | `{}`                                     | Module enablement and module-owned options as JSON             |
| `CENTERIFY_HEALTH_PORT`      | disabled                                 | Optional readiness listener on loopback; integer 1–65535       |
| `CENTERIFY_CONFIG`           | `centerify.config.json`                  | JSON configuration path relative to the working directory      |
| `CENTERIFY_ENV_FILE`         | `.env` unless selected in JSON           | Explicit dotenv file path; must exist when selected            |
| `CENTERIFY_PLUGIN_STATE_DIR` | `.centerify`                             | Persistent plugin registry and data directory                  |

`pretty` output requires development dependencies (`pino-pretty`). Use JSON with
the production container or `npm ci --omit=dev`. Shell-provided values take
precedence over `.env`; dotenv performs environment loading.

## Bot configuration file

Edit [`centerify.config.json`](../centerify.config.json) and restart the bot.
The file contains overrides only: empty sections preserve existing behavior.
Commands, descriptions, module defaults and server settings are still defined
by their owning modules. The generated JSON Schema provides editor completion;
regenerate it after schema changes with `npm run config:schema`.

For example:

```json
{
  "$schema": "./centerify.config.schema.json",
  "envFile": ".env.production",
  "bot": {
    "name": "My Centerify",
    "description": "Manage our community",
    "presence": {
      "status": "online",
      "activity": { "name": "our server", "type": "Watching" }
    }
  },
  "commands": {
    "ping": {
      "name": "latency",
      "description": "Check connection latency",
      "aliases": ["pong"]
    },
    "status": { "enabled": false }
  },
  "modules": {
    "xp": false,
    "custom-commands": {
      "config": { "prefix": "!", "maxCommands": 200, "maxLegacyResponses": 40 }
    }
  },
  "startup": {
    "enabled": true,
    "loginTimeoutMs": 30000,
    "shutdownTimeoutMs": 10000,
    "commandRegistrationRetries": 2
  },
  "logging": { "level": "info", "format": "json" },
  "plugins": { "stateDirectory": ".centerify" }
}
```

| Section        | Supported options                                                                                                                                                                                                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `envFile`      | Path to an existing dotenv file. Defaults to `.env` when omitted.                                                                                                                                                                                                                                                                                                     |
| `bot`          | `name` (2–32 characters), `description` (up to 400), optional `presence`. Name and description update the Discord bot account/application and `/info`; omitted fields preserve current values.                                                                                                                                                                        |
| `bot.presence` | `status`: `online`, `idle`, `dnd`, `invisible`. Optional `activity` has `name` and `type`: `Playing`, `Listening`, `Watching`, `Competing`.                                                                                                                                                                                                                           |
| `commands`     | Keys are existing canonical command names. Each accepts `enabled`, `name`, `description` (1–100 characters), and `aliases` (up to 20). Names use 1–32 lowercase ASCII letters, digits, `_` or `-`.                                                                                                                                                                    |
| `modules`      | Existing module enablement/options, exactly as described below; no second module registry.                                                                                                                                                                                                                                                                            |
| `startup`      | `enabled` defaults to true; false exits before loading runtime adapters. Optional `loginTimeoutMs` bounds connection and identity setup; `shutdownTimeoutMs` sets the cleanup deadline (both 1000–120000). `commandRegistrationRetries` is 1–10, default 1. Optional `commandGuildIds` registers commands only in those Discord servers; omit it for global commands. |
| `logging`      | Existing `level` and `format` values from the environment table above.                                                                                                                                                                                                                                                                                                |
| `plugins`      | Optional `stateDirectory`. Use the same path with the native installer's `--state` option.                                                                                                                                                                                                                                                                            |

Aliases register additional slash names for the same command implementation,
subcommands, Discord permissions, ownership checks and role restrictions.
Renaming does not change the canonical name used in saved command access rules.
`/help` reads effective registrations. Existing instructional text may still
refer to canonical names; aliases preserve those names when preferred.
`verify` and `unverify` retain their canonical names and cannot be disabled;
they accept additional aliases. Duplicate names and unknown or unavailable
command overrides fail before connecting to Discord. Remove a module's command
overrides when disabling that module. Discord permits 100 slash registrations
including aliases. Per-server custom command aliases remain in `/custom`.

Keep tokens and database URLs in a dotenv file or the deployment environment:

```sh
npm run check:config -- --config centerify.config.json --env-file .env.production
npm start -- --config centerify.config.json --env-file .env.production
```

Alternatively set `envFile` in the JSON file, `CENTERIFY_ENV_FILE`, or
`CENTERIFY_CONFIG` to select another JSON file. Paths are relative to the working
directory. Environment-file selection is CLI, then `CENTERIFY_ENV_FILE`, then
JSON `envFile`, then `.env`. An explicitly selected file must exist. Shell
variables override dotenv values. CLI `--config` selects the JSON file ahead of
`CENTERIFY_CONFIG`. `LOG_LEVEL`, `LOG_FORMAT`, `SHUTDOWN_TIMEOUT_MS`, and
`CENTERIFY_PLUGIN_STATE_DIR` override their JSON counterparts. An explicitly set
`CENTERIFY_MODULES` replaces the JSON `modules` section. Configure each setting
in one place; the older environment overrides remain supported for deployments.
The offline checker validates file structure, environment and logging; active
module dependencies, module-owned options and command availability are also
checked during startup before login.

Compose mounts the JSON configuration read-only. Omit `envFile` in that file
unless the selected file is also mounted inside the container. Prefer JSON for
module selection in Compose: arbitrary host environment variables are not
forwarded automatically. The stack fixes JSON logging, a 10-second shutdown
deadline, the plugin-state path, and health port; use a reviewed Compose override
when changing those runtime controls. If increasing the shutdown deadline, also
increase `stop_grace_period` so cleanup can finish.

When enabled, `GET /healthz` checks Discord readiness and access to the migrated
guild configuration table. It listens on `127.0.0.1` only and returns no diagnostic
details. See [readiness and monitoring](deployment.md#readiness-and-monitoring).

## Feature selection and customization

Owners still configure each Discord server with `/verify` and `/settings`.
These persisted settings are separate from the process-level module selection.
Module selection takes effect after a restart.
Prefer the `modules` section of the JSON file for new installations. Existing
environment-based setups continue to work:

```env
# Disable XP while retaining other features.
CENTERIFY_MODULES={"xp":false}

# Or customize the custom-commands module's limits.
CENTERIFY_MODULES={"custom-commands":{"enabled":true,"config":{"maxCommands":200,"maxLegacyResponses":40}}}
```

Built-in module IDs are `guilds`, `moderation`, `xp`, `welcome`, `custom-commands`,
`settings`, `management`, `tickets`, `plugins`, `information`, and the shared `runtime`. Unspecified modules remain
enabled. Keep required dependencies enabled; see [architecture](architecture.md)
for the dependency table. Unknown IDs or invalid feature options fail startup.
Installed plugins are selected by the native marketplace, not installed by
`CENTERIFY_MODULES`. See [plugin management](plugins.md). `CENTERIFY_PLUGIN_STATE_DIR`
sets a shared persistent plugin-state directory; the default is `.centerify`.
The `custom-commands` module also accepts `config.prefix` (1–10 non-whitespace
characters, default `!`). This one setting controls current and legacy message
commands, `{command.prefix}` and argument usage hints. Custom command limits
remain owned by that module. Server-specific XP, greetings, moderation, ticket
settings and custom responses continue to use `/settings`, `/serverconfig`,
`/ticket` and `/custom`; the process config does not overwrite persisted settings.

When changing code, edit the owning module under `src/modules/<feature>`:

- `domain`: policies, validation and plain data types.
- `application`: workflows and repository ports.
- `discord`: commands, permission checks and presentation.
- `infrastructure`: database implementations.
- `index.ts`: public business API; `discord/index.ts`: public Discord API.

Use public entrypoints for cross-module imports. Architecture tests enforce these
boundaries. Zod handles structural validation; Centerify-specific authorization
stays in the owning module. [Creating a module](creating-a-module.md) gives a
complete extension example.

## Quality commands

```sh
npm run format        # Apply the shared Prettier style
npm run lint          # ESLint + typescript-eslint; zero warnings
npm run typecheck
npm run test:security
npm test
npm run build
npm run check         # Formatting, lint, typecheck, tests and production build
npm run audit:production
```

ESLint and Prettier ignore generated Prisma files, migration snapshots and
editor-owned agent files. Build output contains application code and source maps;
tests and migration tooling are excluded. Builds clean stale output first.

## Package choices

| Responsibility                   | Package                             | Reason for use                                                 |
| -------------------------------- | ----------------------------------- | -------------------------------------------------------------- |
| Discord API and command runtime  | discord.js, Sapphire                | Existing typed Discord integration and command lifecycle       |
| Input and environment validation | Zod                                 | Strict schemas and inferred types behind small module adapters |
| Structured logging               | Pino                                | JSON output, serializers and field redaction                   |
| Environment loading              | dotenv                              | Conventional `.env` workflow; validation remains in Zod        |
| Shutdown lifecycle               | close-with-grace                    | Signals, fatal errors, repeated signals and a cleanup deadline |
| Code quality                     | ESLint, typescript-eslint, Prettier | Shared rules and repeatable automated formatting               |
| Regression testing               | Vitest                              | Existing unit, interaction, architecture and integration tests |

Package selection follows suitability, maintenance and compatibility. Use native
Node APIs for URL parsing, streams, filesystem operations and subprocesses.
Dependency updates are proposed weekly by Dependabot. Review and test them before
merging, especially major versions and database-toolchain changes.

# Optional dashboard configuration

The root dashboard launcher reuses the existing environment-file selection and
precedence. OAuth/session/bridge settings are environment secrets, not browser or
guild settings. Leave the bridge secret unset to keep the dashboard module disabled.
See the [dashboard environment table](dashboard.md) and [deployment guide](dashboard-deployment.md).
