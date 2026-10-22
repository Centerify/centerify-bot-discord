# Database and migrations

[Documentation](docs/README.md) · [Deployment](docs/deployment.md) · [Architecture](docs/architecture.md)

Centerify uses Prisma 8 / Prisma Next with PostgreSQL 15 or newer. This is the
contract-first API from `@prisma/orm-postgres`, not a Prisma 7 `schema.prisma` /
`@prisma/client` project. Use the CLI version installed by `npm ci`.

## Source of truth

| File or directory               | Purpose                                         |
| ------------------------------- | ----------------------------------------------- |
| `src/prisma/contract.prisma`    | Authored data contract                          |
| `src/prisma/contract.json`      | Generated runtime contract; committed           |
| `src/prisma/contract.d.ts`      | Generated TypeScript contract; committed        |
| `prisma.config.ts`              | CLI contract path and `DATABASE_URL` loading    |
| `src/adapters/prisma/client.ts` | Runtime database factory and shared client      |
| `src/modules/*/infrastructure/` | Feature-owned repository implementations        |
| `migrations/app/`               | Reviewed migration graph and named refs         |
| `migrations/snapshots/`         | Committed contract snapshots used by that graph |

Domain/application services depend on repository ports. Keep database queries in
infrastructure and expose services through module entrypoints. The runtime
client reads the committed JSON contract; ordinary application builds do not
regenerate it or change the database.

## Initialize a development database

Copy `.env.example` to `.env` and configure a dedicated database. The CLI loads
`.env` through `prisma.config.ts`; the bot's JSON `envFile` selection does not
change the Prisma CLI environment. Export `DATABASE_URL` explicitly when targeting
another database, and keep credentials out of terminal transcripts.

```sh
npm ci
npx prisma migration status
npx prisma db migrate --show
npx prisma db migrate
```

`db migrate` applies the existing graph from the live database marker to the
current contract. It works for a fresh database and existing compatible databases.
It does not prompt before applying destructive operations. Review the path and
migration packages first. Do not use `db init` or `db update` as a substitute for
reviewed production migrations.

## Change the schema

1. Edit `src/prisma/contract.prisma`.
2. Run `npm run contract:emit` and review both generated contract files.
3. Plan the migration from the appropriate existing graph node/ref:
   `npx prisma migration plan --help` describes the installed CLI's options.
4. Review the generated package and complete any data-transform placeholders.
   Self-emit edited `migration.ts` files as instructed by the CLI.
5. Preview with `npx prisma db migrate --show`, apply to an isolated test database,
   and run the database suite.
6. Commit the contract, generated files, migrations, snapshots, and relevant docs.

The default `db` ref records a development checkpoint. Planning does not
implicitly chain from the newest migration directory; inspect refs and the graph
before selecting an origin. Never rewrite previously applied migrations to
silence a hash mismatch. Preserve historical migrations when retiring a module.

## Deploy and inspect

```sh
npx prisma migration status
npx prisma db migrate --show
npx prisma db migrate
```

Online commands use the live database's contract marker. Status output can
contain warnings even with exit status zero; review diagnostics, pending changes,
and unexpected divergence before applying. Schema repair and marker changes
require investigation, not an automatic reset.

Compose includes a separate migration image and waits for its successful exit.
The bot's runtime image excludes the Prisma CLI and development toolchain. Follow
[deployment](docs/deployment.md#upgrades-and-rollback) to rerun the current
migration image on every release. Back up before schema changes; application
rollback does not reverse the database schema.

## Test safely

```sh
TEST_DATABASE_URL=postgresql://user:password@localhost/centerify_test npm run test:database
TEST_DATABASE_URL=postgresql://user:password@localhost/centerify_test npm run test:e2e
```

On PowerShell, set `$env:TEST_DATABASE_URL` before running either npm command.
Use a migrated, disposable database. Integration tests create synthetic guilds
and clean them up. `test:database` can fall back to `DATABASE_URL`; `test:e2e`
requires an explicit test URL. Neither is an appropriate production health check.

Prisma Next is currently a release candidate. Review its shipped
`.agents/skills/prisma-8/` guidance and installed package documentation before
changing APIs or upgrading; do not copy commands from older Prisma generations.
