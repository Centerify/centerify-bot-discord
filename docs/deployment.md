# Production deployment

## Runtime and release checks

Use Node.js 24 LTS and a dedicated PostgreSQL 15+ database/account. Complete
`npm run check`, `npm run audit:production`, and the database integration suite
against a migrated test database before releasing. CI runs the full suite on
Linux, portability checks on Windows and a Docker image build.

```sh
TEST_DATABASE_URL=postgresql://user:password@localhost/centerify_test npm run test:database
```

Apply migrations with the development toolchain in a trusted release job:

```sh
npm ci
npm run check:config
npx prisma db migrate
npm run build
```

The application does not apply migrations automatically. Deploy only after the
migration succeeds; keep backups and review schema changes. The Prisma Next
toolchain is currently a release candidate and has the development-only advisory
described in [security](security.md); this remains a release consideration.

## Container

```sh
docker build --target runtime --tag centerify:local .
docker run --detach --name centerify --restart unless-stopped \
  --env-file .env --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --cap-drop ALL --security-opt no-new-privileges \
  --stop-timeout 15 centerify:local
```

The database URL must point to a database reachable from the container; its
`localhost` is the container itself. Configure that URL before deployment.
The Dockerfile uses a non-root runtime user, JSON logs, production dependencies
only, and an application-only build. Secrets and local working files are excluded
from the build context. No application HTTP port is needed for the Discord gateway.

Choose a container stop timeout greater than `SHUTDOWN_TIMEOUT_MS / 1000`.
`close-with-grace` handles signals and fatal errors, then closes the Discord
client, collectors, modules and database. Failed cleanup or a missed deadline
exits unsuccessfully so the supervisor can restart the process.

## Node deployment without Docker

Build in a release workspace, then copy `dist/`, `package.json` and
`package-lock.json` to the runtime directory. In that directory:

```sh
npm ci --omit=dev --ignore-scripts
NODE_ENV=production LOG_FORMAT=json npm start
```

Use your service manager to supply secrets, restart failed processes and allow
the configured shutdown interval. `npm run dev` and TypeScript/watch tooling are
development commands. Runtime startup validates configuration automatically.

## Deployment validation

The local tests simulate Discord delivery and never log the bot in. Live checks
require an explicitly configured bot and migrated PostgreSQL. Run the read-only
`npm run check:discord` after registration to verify connectivity and installed
commands. Use a staging server to exercise permissions and settings before rollout.

Docker and live service verification depend on the execution environment. A
successful unit/build check alone does not establish that hosting permissions,
Discord credentials or database connectivity are configured correctly.
