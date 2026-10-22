# Dashboard deployment and recovery

Keep the normal bot-only Compose stack unchanged unless enabling the dashboard.
The optional override adds one web service and an internal bridge network. It
installs **no plugins**. Existing migration ordering, PostgreSQL persistence,
restricted database account, plugin volumes and non-root runtime remain in place.

```sh
cp .env.compose.example .env.compose
# Fill in bot/database credentials and the optional OAuth/bridge variables.
docker compose --env-file .env.compose -f compose.yaml -f compose.dashboard.yaml config --quiet
docker compose --env-file .env.compose -f compose.yaml -f compose.dashboard.yaml up --build -d --wait
```

The web port binds only `127.0.0.1:3001`. Put an HTTPS reverse proxy on the same
host in front of it; set `AUTH_URL` to the exact canonical HTTPS origin and register
its Discord callback. Forward the canonical Host and protocol only from trusted
proxies. Disable SSE buffering on `/api/events`, allow at least a 60-second stream
timeout, and bound concurrent connections and per-client request rates. Do not
publish bridge port 3010 or share the database/bridge network with untrusted code.

Example nginx location configuration:

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
}
location /api/events {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_buffering off;
    proxy_read_timeout 65s;
}
```

Container builds use Next.js standalone output on Linux. Local Windows builds use
normal Next.js output to avoid symlink restrictions. Run `npm run dashboard:build`
then `npm run dashboard:start` locally. Set
`CENTERIFY_DASHBOARD_STANDALONE=true` explicitly when producing a standalone artifact.
The standalone root includes shared repository validation modules; retain its
generated directory structure and `.next/static` files.

The public `/api/health` endpoint returns only generic readiness. It checks OAuth
configuration, the authenticated internal bridge, Discord readiness and database
access. Demo health is explicitly `status: demo, connected: false`. The bot's
existing `/healthz` remains its normal readiness endpoint.

## Migrations and backups

The additive `dashboard_foundation` migration chains from the existing ticket-settings
contract, adds dashboard accounts/events/operation reservations/workflows/plugin
activations, and does not replace existing GuildConfig, cases, XP or custom commands.
Review it before applying to a shared database. Applying migrations against a live
database is distinct from emitting/reviewing the generated migration locally.

Back up PostgreSQL and plugin state with the existing [deployment procedures](deployment.md).
Dashboard data is included in the database backup; Better Ticket state remains in
the existing plugin state volume. Protect backups as moderation and support data.
Restore the database and plugin state from a consistent checkpoint. Preserve operation
reservations so replayed requests cannot repeat effects after recovery.

Never blindly repeat an operation marked uncertain. Reconcile Discord audit entries,
case history and the recorded operation ID, then have an authorized operator decide
the next explicit action. Saving a stale settings/workflow/plugin revision returns
409; reload and review instead of forcing an overwrite.

## Multiple web instances

Scale only the Next.js service behind a proxy, with identical OAuth/session secrets
and bridge destination. The single bot gateway owner and PostgreSQL event log serve
all replicas. Do not scale the bot service with the same token. Workflow cooldowns
and cancellation belong to that gateway owner; they reset on bot restart. Implement
a shared broker/lease/cooldown system before introducing distributed gateway owners.

The demonstration uses per-process memory and must not be used as shared production
storage. Demo state is deliberately disposable and contains no production metrics.

## Validation and rollout

CI installs both lockfiles, checks dashboard types/build, runs an HTTP demo smoke,
then migrates an isolated test PostgreSQL database and exercises persistence. Core
tests cover signing/replay, capability denial, guild isolation, workflow validation,
effect-free tests, cancellation and plugin contracts. Browser verification must cover
sign-in prerequisites, navigation, forms, dialogs, four themes, mobile/tablet layouts
and canvas/outline editing. Live OAuth and Discord side effects require a dedicated
test guild; confirm role hierarchy and ticket privacy there before production use.
