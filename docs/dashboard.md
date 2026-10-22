# Web dashboard

Centerify's Next.js App Router dashboard lives in `dashboard/`. The browser talks
only to its authenticated backend. That backend signs requests to a private bridge
inside the existing bot process. Discord operations use the running bot and its
services; the web server does not log in a second gateway client.

**Plugins are optional. None are installed or activated by default**, including in
demo mode. Available packages are catalog entries, not installed executable code.
Community Kit is a separately installable example. Better Ticket 1.1.0 adds its
optional dashboard adapter; installing a package still requires the operator's
terminal and a restart. Existing operator-managed installations are preserved.

## Local setup

Use Node.js 24 and the repository's npm lockfiles:

```sh
npm ci
npm ci --prefix dashboard
cp .env.example .env
# Configure the bot, database, OAuth, and bridge settings described below.
npx prisma db migrate
npm run build
npm start
# In another terminal:
npm run dashboard:dev
```

The root launcher reuses `loadStartupEnvironment`, preserving JSON `envFile`,
`CENTERIFY_ENV_FILE`, `CENTERIFY_CONFIG`, `--config`, `--env-file`, and shell variable
precedence. For example:

```sh
npm run dashboard:dev -- --config centerify.config.json --env-file .env.production
```

Direct dashboard commands (`npm --prefix dashboard run dev`) instead use Next.js's
environment loading; copy `dashboard/.env.example` to `dashboard/.env.local` for
that path. Never expose credentials through `NEXT_PUBLIC_*` variables.

## Discord OAuth

Use the same Discord application as the bot. In the Developer Portal, add the
exact redirect URI `https://YOUR-DASHBOARD/api/auth/callback/discord` (or
`http://localhost:3000/api/auth/callback/discord` for local development).

| Variable                            | Purpose                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| `AUTH_URL`                          | Canonical public origin, HTTPS in production                       |
| `AUTH_DISCORD_ID`                   | Discord application ID                                             |
| `AUTH_DISCORD_SECRET`               | OAuth client secret, web server only                               |
| `AUTH_SECRET`                       | Independent random secret for encrypted Auth.js session cookies    |
| `CENTERIFY_DASHBOARD_BRIDGE_SECRET` | Different random secret, shared by web and bot                     |
| `CENTERIFY_DASHBOARD_BRIDGE_URL`    | Private bot URL, default `http://127.0.0.1:3010`                   |
| `CENTERIFY_DASHBOARD_BRIDGE_HOST`   | Bot bind address; defaults to loopback                             |
| `CENTERIFY_DASHBOARD_BRIDGE_PORT`   | Bot bridge port, defaults to 3010                                  |
| `CENTERIFY_DASHBOARD_OPERATORS`     | Explicit operator Discord IDs; never inferred from guild ownership |
| `CENTERIFY_DASHBOARD_DEMO`          | Explicit `true` enables isolated demo sessions on the web server   |

Generate independent secrets with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
The bot bridge is disabled unless its secret is set. Configure `guilds`,
`custom-commands`, and `plugins` modules when enabling the dashboard bridge.

Auth.js requests `identify guilds`, uses state and PKCE, and provisions a
`DashboardAccount` at first successful login. Tokens stay inside the encrypted,
HttpOnly session cookie and are never included in `/api/me` or the Auth.js session
response. Sessions expire after at most eight hours or the Discord access-token
expiry, whichever comes first. Reauthentication is required on expiry; refresh
tokens are not retained. Logout clears the session.

The server list combines current bot membership with Discord's manageable guilds.
Installation links request the bot and application-command scopes with no blanket
Administrator grant. Grant only the permissions required by enabled modules and
place the bot role correctly. The current guild owner must still run `/verify`.

## Demo

Set `CENTERIFY_DASHBOARD_DEMO=true` explicitly on the web server. Start the dashboard
without starting the bot or supplying Discord credentials, then choose **Explore
the demo workspace** on the sign-in page. Every page carries a demo banner, metrics
are illustrative, and simulated mutations report that no Discord action occurred.
State is isolated by browser session, held in memory for up to eight hours, and
reset on web restart. No plugins are installed or activated in demo fixtures.
Disable demo mode for a real deployment.

## Features and authoritative sources

| Existing feature                       | Dashboard surface                                                                                      | Source of truth                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Information, status, ping              | Overview connectivity, uptime, latency and module list                                                 | Running Sapphire client and ModuleRegistry                             |
| Members and roles                      | Members search, profiles, role actions                                                                 | Discord REST with fresh membership/hierarchy checks                    |
| Warnings, notes, timeouts, bans, kicks | Moderation dialog, cases and profiles                                                                  | Existing moderation services and allowlisted component action executor |
| Reports                                | Moderation → Member reports, accept/reject                                                             | Existing report repository                                             |
| Global moderation                      | Server settings opt-ins; execution remains in authorized Discord commands                              | GuildConfig and existing global authorization                          |
| Built-in tickets                       | Inbox, conversation, close/reopen, export latest 100 messages                                          | Discord channel/topic and shared ticket action layer                   |
| Better Ticket, if installed            | Same inbox plus claim/transfer, priority, tags, private notes, archive transcript; department settings | The installed plugin's TicketStore and Runtime action methods          |
| Custom commands and aliases            | Catalog, full definition editor, import/export and diagnostic                                          | CustomCommandService, validator and stored restrictions                |
| Legacy custom responses                | Catalog inspection, `/custom` prerequisite for legacy edits                                            | Existing legacy service; no parallel dashboard settings                |
| Welcome, goodbye, auto roles           | Server settings and response preview                                                                   | Existing GuildConfig fields and role policy                            |
| XP earning and sharing                 | Server settings, per-member XP                                                                         | GuildConfig and MemberXp; peers must opt in                            |
| Ownership verification                 | Verification status and explicit `/verify` prerequisite                                                | Existing owner verification service                                    |
| Channel, role and server management    | Member role actions and authoritative built-in command catalog                                         | Existing `/channel`, `/role`, `/serverconfig` handlers                 |
| Logging and module availability        | Server settings, runtime configuration inspection                                                      | GuildConfig plus sparse startup configuration                          |
| Workflows                              | Visual/outline builder, tests, versions and `/flow` command                                            | DashboardWorkflow, runtime allowlisted ports                           |
| Plugins                                | Available/installed views and per-guild extension settings                                             | Native installed registry and DashboardPlugin activations              |

There is no Aliens module: “aliens” is treated as command aliases. No separate
automoderation engine, appeal-state model, or arbitrary custom event subscription
was discovered; the UI does not invent controls or metrics for those features.
Channel deletion, global moderation, arbitrary legacy editing and bot identity
changes remain in their existing Discord/operator workflows, with prerequisites
explained rather than simulated as successful dashboard actions.

Settings forms submit sparse patches against the existing `GuildConfig`; optimistic
timestamps reject concurrent changes. `centerify.config.json` is never rewritten
by the dashboard. Built-in command aliases, prefixes, identity and module selection
remain operator startup configuration and require a restart.

## Deployment and checks

See [deployment](dashboard-deployment.md), [permissions and events](dashboard-security.md),
[workflow format](dashboard-workflows.md), and [plugin development](dashboard-plugins.md).

```sh
npm run format:check
npm run lint
npm run typecheck
npm run dashboard:typecheck
npm test
npm run build
npm run dashboard:build
# Against an explicitly enabled running demo at localhost:3001:
node scripts/test-dashboard.mjs
# Against an isolated, migrated PostgreSQL test database:
npm run test:database
```

The Windows sandbox may require workspace-local `TEMP` and `TMP` for Vitest and
loopback network permission for readiness/HTTP tests. Those restrictions are not
application failures. Live Discord OAuth, Discord effects and container deployment
must be verified separately with real credentials and a Docker-capable host.
