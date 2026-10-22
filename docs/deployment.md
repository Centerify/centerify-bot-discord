# Production deployment

[Documentation](README.md) · [Configuration](configuration.md) · [Security](security.md)

The supported topology is one Centerify process per Discord application and one
PostgreSQL database. Compose targets a single Docker host with Linux containers;
it does not provide high availability or coordinate multiple bot replicas.

## Requirements and release preparation

- Docker Engine or Docker Desktop with Compose 2.20 or newer.
- Outbound HTTPS/WebSocket connectivity to Discord, DNS, and image registries.
- A starting resource budget of about 3 GiB RAM for the runtime services, plus
  build capacity. Tune limits using observed workload; transcript and plugin data
  also need disk space.
- A Discord application with the intents and permissions in the
  [quick start](../README.md#discord-setup).

Before rollout, run `npm run check`, `npm run audit:production`, and
`npm run test:database` with an explicit, isolated `TEST_DATABASE_URL`. Review
migration changes and take a recoverable backup. The Prisma Next toolchain is a
release candidate; see [database workflow](../prisma-next.md) and [security](security.md).

## First installation

Copy `.env.compose.example` to `.env.compose`. Set the bot token and two
**different** database passwords. Generate each password with a password manager,
or on a host with Node.js:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Use hexadecimal passwords: Compose constructs the application URL from
`CENTERIFY_DB_PASSWORD`, so reserved URL characters require additional encoding.
The separate `POSTGRES_PASSWORD` belongs to the database administrator and is not
passed to the bot or migration service. Restrict `.env.compose` to the deployment
operator (`chmod 600 .env.compose` on Linux, equivalent ACLs on Windows).
Environment variables already set in your shell override values from this file.

Edit `centerify.config.json` before starting. The file is mounted read-only into
the bot; omit `envFile` because Compose supplies credentials directly. For a
bounded login, set `startup.loginTimeoutMs` to `60000` (up to `120000` is supported).
Do not disable startup in a production deployment.

```sh
docker compose --env-file .env.compose config --quiet
docker compose --env-file .env.compose up --build --detach --wait --wait-timeout 180
docker compose --env-file .env.compose ps --all
docker compose --env-file .env.compose logs --tail 100 bot migrate
```

`config --quiet` validates without printing expanded secrets. Do not publish the
output of plain `docker compose config` or container inspection. Docker operators
can inspect container environment variables; access to the Docker daemon is a
privileged administrative capability.

### Services and storage

| Service    | Responsibility                                                        |
| ---------- | --------------------------------------------------------------------- |
| `postgres` | PostgreSQL 17 with a persistent `postgres_data` volume; no host port  |
| `migrate`  | One-shot Prisma migration image with the locked development toolchain |
| `bot`      | Non-root application image with runtime dependencies only             |
| `plugins`  | Optional `tools` profile for offline native plugin administration     |

The database initialization script creates a `centerify` login without superuser,
role-creation, or database-creation privileges. It owns the application database
and can apply schema migrations. PostgreSQL initialization scripts and initial
password variables run **only on an empty data volume**. Editing environment
passwords does not rotate existing database credentials. Rotate with an approved
SQL administration session, then update the environment and recreate dependents;
do not delete a data volume to change a password.

Compose waits for database health, then successful migration completion before
starting the bot. A failed migration blocks startup. The application itself never
applies migrations. `migrate` exiting with status 0 is expected.

`plugin_state` stores the registry and plugin data; `plugin_packages` stores
installed code. The bot sees installed packages read-only. Named volumes survive
`docker compose down`. **`down --volumes` deletes stored data** and is appropriate
only for disposable environments or a deliberate teardown after verified backups.
Keep the Compose project name stable: changing the directory/project name can
select different volumes and appear to lose data.

The runtime filesystem is read-only apart from plugin state and a bounded `/tmp`
tmpfs. Runtime and migration processes run as `node`; capabilities are dropped,
privilege escalation is disabled, and an init process forwards signals. The bot
has a 30-second stop grace period for its fixed 10-second cleanup deadline.
JSON logs rotate at 10 MiB with three files per container. Configure a host log
collector and disk monitoring for longer retention.

The database network is internal. Only the bot also joins a network with outbound
access for Discord. There are no published database or application ports. Base
images track their named Node/PostgreSQL major versions; pin approved digests in
your release process if immutable external image inputs are required.

## Readiness and monitoring

Compose enables `CENTERIFY_HEALTH_PORT=3000`. The endpoint binds only to
`127.0.0.1` **inside the container**. `GET /healthz` returns 200 only while the
Discord client is ready and a query to the migrated guild configuration table
succeeds. Failures or a two-second check timeout return 503 without credentials
or error details. Concurrent probes share a pending database check.

```sh
docker compose --env-file .env.compose exec -T bot node scripts/healthcheck.mjs
docker compose --env-file .env.compose logs --follow --tail 100 bot
```

Health checks run every 30 seconds with a 90-second startup allowance. They do
not prove that every Discord permission or feature works. Use a staging server
to exercise `/verify`, settings, moderation, and tickets before rollout.
Docker's restart policy restarts exited containers; **it does not restart a
running unhealthy container**. Alert on unhealthy status, repeated exits,
migration failures, database storage, and memory pressure. Investigate outages
before restarting; Discord reconnects may recover without intervention.

## Upgrades and rollback

1. Read the release diff and migrations. Back up the database, both plugin volumes,
   configuration, and the deployed Git commit/image tag.
2. Check out the reviewed release and set `CENTERIFY_IMAGE_TAG` to its commit or
   release identifier. Build before interrupting the running bot.
3. Stop the bot so only one process can execute commands while the schema changes.
4. Review the migration path, apply it, and recreate the bot.

```sh
docker compose --env-file .env.compose build --pull bot migrate
docker compose --env-file .env.compose stop bot
docker compose --env-file .env.compose run --rm migrate node node_modules/prisma/dist/prisma.js db migrate --show
docker compose --env-file .env.compose run --rm migrate
docker compose --env-file .env.compose up --detach --no-deps --force-recreate --wait --wait-timeout 180 bot
```

The explicit `run --rm migrate` ensures the current image runs even if a previous
one-shot container already completed. `--no-deps` on the last command avoids
rerunning an old migration container after the reviewed job succeeded. A failed
migration leaves the bot stopped: inspect the error and fix the migration path
before starting it. Do not use `restart` to apply a new image or environment;
recreate the container.

Application rollback requires an image compatible with the current schema.
Migrations are not automatically reversed. If a schema change is incompatible,
restore the matching backup into an isolated project and validate it before
cutover. Stop the old bot before starting the restored instance with the same token.

## Backup

The following POSIX-shell example pauses writes for a consistent database/plugin
backup. Use a fresh backup directory per snapshot; keep encrypted copies off-host
and apply a retention policy. On PowerShell, create the directories with
`New-Item -ItemType Directory` and run the same Compose commands individually.
Do not redirect a binary `pg_dump` stream through Windows PowerShell.

```sh
mkdir -p backups/plugin-state backups/plugin-packages
docker compose --env-file .env.compose stop bot
docker compose --env-file .env.compose exec -T postgres pg_dump -U postgres -d centerify -Fc -f /tmp/centerify.dump
docker compose --env-file .env.compose cp postgres:/tmp/centerify.dump backups/centerify.dump
docker compose --env-file .env.compose cp bot:/app/.centerify/. backups/plugin-state/
docker compose --env-file .env.compose cp bot:/app/plugins/installed/. backups/plugin-packages/
docker compose --env-file .env.compose start bot
```

Copy `centerify.config.json`, the deployment revision, and image tags alongside
these files. Back up credentials separately in a secret store. Verify the dump
with `pg_restore --list` and regularly perform the restoration drill below.
A database dump alone does not include plugin data or Discord channel history.

## Restoration drill

Use the backup's source revision and matching image tag. The example creates an
isolated `centerify-restore` project with fresh volumes; confirm it is unused first.
It does not start a second bot or connect to Discord during restoration.

```sh
docker compose --env-file .env.compose -p centerify-restore up --detach --wait postgres
docker compose --env-file .env.compose -p centerify-restore cp backups/centerify.dump postgres:/tmp/centerify.dump
docker compose --env-file .env.compose -p centerify-restore exec -T postgres pg_restore -U centerify -d centerify --clean --if-exists --no-owner --exit-on-error /tmp/centerify.dump
docker compose --env-file .env.compose -p centerify-restore build bot plugins
docker compose --env-file .env.compose -p centerify-restore run --rm --no-deps --volume "$PWD/backups:/restore:ro" --entrypoint sh plugins -c 'cp -R /restore/plugin-state/. /app/.centerify/ && cp -R /restore/plugin-packages/. /app/plugins/installed/'
docker compose --env-file .env.compose -p centerify-restore run --rm --no-deps plugins verify better-ticket
```

The last command applies when Better Ticket was installed; otherwise inspect
`plugins installed` and verify the packages in your backup. Check database counts
and expected settings before cutover. Restore the configuration file too. Stop
the original bot, then start only the restored bot with `up --detach --no-deps bot`
and confirm health. Preserve the original volumes until recovery is verified.
If testing an upgrade, run the target release's reviewed migration job against
the restored database before starting that newer bot.

## Plugin administration

The optional tools image builds a native Go installer and includes the packaged
Better Ticket module. No Go compiler or development dependencies enter the bot
image. Installed code and state use the same named volumes as the bot.

```sh
docker compose --env-file .env.compose build plugins
docker compose --env-file .env.compose stop bot
docker compose --env-file .env.compose run --rm --no-deps plugins install better-ticket
docker compose --env-file .env.compose run --rm --no-deps plugins verify better-ticket
docker compose --env-file .env.compose start bot
```

Use `plugins installed`, `plugins disable better-ticket`, or `plugins tui` in the
same command pattern. For a vetted local package, mount its directory read-only
into the tools container and pass `install --path /package`; see [plugins](plugins.md).
Changing a package requires rebuilding the tools image and a new package version.
Back up state before changes. The host installer's `.centerify` directory is
separate from these Docker volumes and is not automatically imported.

## External PostgreSQL and standalone containers

The default Compose file manages its own database. To use an external service,
create a reviewed override that sets `DATABASE_URL` for **both** `bot` and
`migrate`, removes their local PostgreSQL dependency, and gives them an outbound
network. Remove the unused local database service from that deployment definition.
Use the provider's TLS settings and dedicated credentials; never set a remote
URL to `localhost` inside a container. Migration tooling requires DDL rights;
operators may provision a separate runtime role with narrower grants.

For a standalone image, build `--target runtime`. Supply environment credentials,
read-only configuration, persistent plugin state/packages, and the same hardening
and stop settings shown in `compose.yaml`. Apply migrations from the matching
`--target migration` image before starting. No inbound port is required for the
Discord Gateway. The readiness probe is opt-in outside Compose.

## Node deployment without Docker

Build with Node.js 24 and the locked development toolchain. Validate configuration,
review and apply `npx prisma db migrate`, then run `npm run build`. Copy `dist/`,
`package.json`, `package-lock.json`, `centerify.config.json`, the schema, and
`marketplace/catalog.json` to the runtime directory. Keep plugin state/packages
in persistent directories. In that runtime directory:

```sh
npm ci --omit=dev --ignore-scripts
NODE_ENV=production LOG_FORMAT=json npm start
```

Use a service manager for environment variables, logs, restart policy, and a stop
timeout greater than `SHUTDOWN_TIMEOUT_MS / 1000`. If readiness is enabled, copy
`scripts/healthcheck.mjs` too. Watch mode is for development.

## Troubleshooting

| Symptom                                  | Action                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Compose reports a required variable      | Fill `.env.compose` and include `--env-file .env.compose` on every command                                  |
| Database stays unhealthy                 | Check `logs postgres`, volume permissions, disk space, and initialization errors                            |
| Migration exits nonzero                  | Inspect `logs migrate` or rerun the job interactively; review the migration graph instead of resetting data |
| Bot never becomes healthy                | Check token, enabled intents, outbound connectivity, login timeout, and the migrated schema                 |
| Password change is ignored               | Initialization variables do not alter existing database roles; rotate via SQL administration                |
| Configured env file cannot be read       | Remove host-only `envFile` from the mounted JSON or explicitly mount that file                              |
| Plugin is absent after a host install    | Use the Compose tools service; host registry files and named Docker volumes are separate                    |
| Data appears empty after moving checkout | Check project name and existing volumes before initializing another stack                                   |

CI builds runtime, migration, and plugin tools images and runs a disposable
database/container smoke check. It does not log into Discord. Live verification
still requires a configured application and a staging server. The read-only
`npm run check:discord` checks connectivity and registration after an initial
bot startup; it is not a command-execution test.

Compose behavior follows the official [startup order](https://docs.docker.com/compose/how-tos/startup-order/)
and [service reference](https://docs.docker.com/reference/compose-file/services/).
