# Dashboard authorization, audit and live events

## Access boundaries

Every protected route authenticates on the server. The web backend asserts the
Discord user ID through a private HMAC bridge using method, complete path/query,
body digest, timestamp and random nonce. Requests expire after 30 seconds, and the
single gateway owner rejects nonce replay. Never publish port 3010. Across hosts,
use an authenticated private network and TLS for the bridge.

The bridge fetches current guild membership for each request. It derives
capabilities from Discord permissions and current support-role configuration:

| Capability                                   | Access                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| Overview                                     | Any authorized dashboard capability                                    |
| Settings, command editing, plugin activation | Owner, Administrator, or Manage Server                                 |
| Moderation records                           | Owner/manager or Moderate Members, Ban Members, Kick Members           |
| Ticket inbox                                 | Owner/manager, Manage Channels, or configured department support roles |
| Individual moderation action                 | That action's actual Discord permission, bot permission and hierarchy  |
| Ticket conversation and private notes        | Current department staff plus channel View/Read History                |
| Global package code changes                  | Explicit host operators using the native terminal installer            |

Server verification is additionally required before mutations and workflow
effects. Administrators cannot moderate the owner, themselves, the bot, or targets
above their role. Role operations reuse the existing safe-role policies. Per-command
role restrictions remain additional checks. Workflow responses may be invoked by
ordinary guild members through `/flow`, but effects never inherit the publisher's
permissions, except owner-authored member-join events that recheck the current owner.

Auth.js manages OAuth state, PKCE and cookie protections. JSON mutations require
the canonical same-origin Origin header, reject cross-site fetches and require a
UUID operation key. API bodies are limited to 512 KiB. Never cache protected API
responses or configure permissive CORS. A reverse proxy should add per-client
connection/request limits; the internal bridge also bounds body/header/request time.

## Auditing and duplicate prevention

`DashboardOperation` reserves an actor/guild/key before effects. A concurrent
duplicate returns a conflict; completed duplicates replay the recorded result.
Different input with the same key is rejected. Interrupted/failed effects remain
uncertain and cannot be retried with that key. Check Discord and the audit trail
before deliberately starting a new operation. Exactly-once external Discord effects
cannot be transactionally guaranteed across a Discord success and database outage.

`DashboardEvent` identifies the actor, guild, operation, timestamp and outcome.
Moderation cases retain reasons and evidence references. Bulk moderation reports
each target separately and never rolls successful Discord effects back implicitly.
Bot logs do not receive dashboard request bodies, signatures, access tokens or raw
OAuth/Discord API errors. Store/database access and backups still require protection.

Audit and operation records are retained until an operator applies their documented
retention policy. Do not delete recent operation keys while retries may still occur.
Workflow history retains up to 30 published definitions. Transcripts exported from
the inbox contain only the displayed conversation; private notes stay separate.

## Event transport

`GET /api/events?guildId=...&cursor=...` is an authenticated SSE stream. The bridge
reads the durable, monotonically numbered PostgreSQL event log; the Next.js server
polls it every three seconds. Streams close after roughly 50 seconds and reconnect
with `Last-Event-ID`. The client deduplicates IDs and invalidates guild-scoped Query
caches. A missing retained cursor emits `reset` and refreshes data. Disconnection
shows stale/reconnecting status; revoked membership or expired sessions stop access.

Subscriptions reauthenticate and reauthorize on every poll. Public stream payloads
exclude event detail/trace data; only authorized audit reads expose those details.
Member joins/leaves/updates, channel/ticket changes, moderation cases, completed
command handlers, dashboard settings and plugin activations generate events. The
source of handler-completion events does not certify that the handler performed a
successful Discord mutation. Overview activity starts when the bridge is enabled;
there is no fabricated historical backfill. Analytics cap a period at 10,000 events
and disclose that cap in the UI.

Deploy one bot gateway owner per token. Multiple Next.js instances share the same
`AUTH_SECRET`, bridge secret and database-backed bot bridge; SSE needs no sticky
web session. Distributed gateway sharding or multiple bot owners requires a broker
and shared replay/cooldown coordination; do not run duplicate gateway owners under
this topology. Demo memory state is intentionally single-process and not a production
multi-instance storage design.
