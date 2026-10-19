# Configuration and development

Use Node.js 24 LTS, as specified in `.nvmrc` and `package.json`. Install with
`npm ci` so the lockfile controls the exact dependency tree.

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

| Variable              | Default                                  | Meaning                                                        |
| --------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| `DISCORD_TOKEN`       | required                                 | Bot token from the Discord Developer Portal                    |
| `DATABASE_URL`        | required                                 | `postgresql://user:password@host:5432/database`                |
| `NODE_ENV`            | `development`                            | `development`, `test` or `production`                          |
| `LOG_LEVEL`           | `info`                                   | `trace`, `debug`, `info`, `warn`, `error`, `fatal` or `silent` |
| `LOG_FORMAT`          | `json` in production; `pretty` otherwise | Structured logs or readable development logs                   |
| `SHUTDOWN_TIMEOUT_MS` | `10000`                                  | Cleanup deadline; integer from 1000 through 120000             |
| `CENTERIFY_MODULES`   | `{}`                                     | Module enablement and module-owned options as JSON             |

`pretty` output requires development dependencies (`pino-pretty`). Use JSON with
the production container or `npm ci --omit=dev`. Shell-provided values take
precedence over `.env`; dotenv performs environment loading.

## Feature selection and customization

Owners still configure each Discord server with `/verify` and `/settings`.
These persisted settings are separate from the process-level module selection.
Module selection takes effect after a restart.

```env
# Disable XP while retaining other features.
CENTERIFY_MODULES={"xp":false}

# Or customize the custom-commands module's limits.
CENTERIFY_MODULES={"custom-commands":{"enabled":true,"config":{"maxCommands":200,"maxLegacyResponses":40}}}
```

Built-in module IDs are `guilds`, `moderation`, `xp`, `welcome`, `custom-commands`,
`settings`, `information`, and the shared `runtime`. Unspecified modules remain
enabled. Keep required dependencies enabled; see [architecture](architecture.md)
for the dependency table. Unknown IDs or invalid feature options fail startup.

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
