# Contributing to Centerify

Discuss substantial behavior or schema changes in an issue before implementation
so maintainers can review the approach.

## Development setup

Use Node.js 24 and `npm ci`. Copy `.env.example` to `.env` and configure a
development Discord application and PostgreSQL 15+ database. Follow
[configuration](docs/configuration.md) and the [database guide](prisma-next.md)
before starting the bot. Do not connect development tooling or tests to production.

## Make a change

1. Create a focused branch from the current default branch.
2. Edit the owning module. Use public entrypoints for cross-module imports and
   keep Discord and database details out of domain/application code.
3. Add regression coverage for changed behavior. Keep tests independent of live
   services unless they belong to the integration suite.
4. Update the relevant guide and examples when behavior or configuration changes.
5. Run `npm run check` and `npm run audit:production`.

Set `TEST_DATABASE_URL` to an isolated, migrated database and run
`npm run test:database` for persistence changes. For container changes, build the
Compose images, run migrations on a disposable volume, and verify non-root
execution and readiness. CI includes these container checks without a Discord token.

Schema changes must include regenerated `src/prisma/contract.json` and
`contract.d.ts`, reviewed migration packages, and snapshots. Keep historical
migrations intact. See [creating a module](docs/creating-a-module.md) and
[architecture](docs/architecture.md) for extension contracts.

## Pull requests

Explain the problem, resulting behavior, and validation performed. Include
screenshots for visible Discord interaction changes when useful. Call out
migrations, configuration changes, and operational limits. Keep generated
artifacts consistent with their sources, and do not include credentials, local
plugin state, build output, or unrelated formatting changes.

## Bug reports

Include the Git commit, Node/Docker versions, enabled modules, expected and actual
behavior, and minimal reproduction steps. Redact tokens, connection strings,
member data, and private transcripts. Use [SECURITY.md](SECURITY.md) for vulnerabilities.

# Dashboard changes

Install both lockfiles (`npm ci` and `npm ci --prefix dashboard`). For dashboard work,
also run `npm run dashboard:typecheck`, `npm run dashboard:build`, and
`node scripts/test-dashboard.mjs` against an explicitly enabled local demo. Keep
plugins opt-in; never add seeded production activations or installation side effects.
See [dashboard architecture and validation](docs/dashboard.md).
