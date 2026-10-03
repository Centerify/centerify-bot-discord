# Centerify Discord Bot

Centerify is a Discord bot built with TypeScript, Sapphire Framework, Discord.js, and Prisma. It is designed to help manage Discord servers from one bot.

## Features

- Discord slash command support with Sapphire Framework
- Independent server settings with current-owner verification
- Interactive setup for greetings, automatic roles, logging, and moderation
- Moderation cases, warnings, member reports, and opt-in global moderation
- Message XP, levels, and a leaderboard with server, global, or selected-server sharing
- Server-specific custom message commands and member join/leave responses
- `/ping` command for checking bot responsiveness
- TypeScript-first project structure
- Environment-based configuration with `dotenv`
- Prisma 8 / Prisma Next data layer setup
- Production build output through `tsc`

## Tech Stack

- Node.js
- TypeScript
- Discord.js
- Sapphire Framework
- Prisma 8 / Prisma Next
- PostgreSQL
- Pino

## Getting Started

The current Discord server owner must run `/verify` inside the server before
Centerify commands or automatic actions can run. Administrator permission alone
does not authorize the bot. After verification, run `/settings` to configure it.
If server ownership changes, the new owner must run `/verify` again.
The current owner can run `/unverify` to revoke authorization. Centerify
commands remain disabled until the current owner runs `/verify` again.

### Prerequisites

- Node.js 22 or newer
- npm
- A Discord bot token
- A PostgreSQL database URL

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/iamaloneforever/centerify-bot-discord.git
cd centerify-bot-discord
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
DISCORD_TOKEN=your_discord_bot_token
DATABASE_URL=postgresql://user:password@localhost:5432/database
```

### Discord application setup

Create a bot application in the Discord Developer Portal and copy its bot token
into `.env`. On the application's **Bot** page, enable **Server Members Intent**,
**Presence Intent**, and **Message Content Intent**; this bot requests all three
when connecting.

Generate a server installation link with the `bot` and `applications.commands`
scopes. Invite the same application to every server you want to manage. Grant
View Channel, Send Messages, and Embed Links in its output channels, plus
Read Message History for reaction XP. Features that assign roles or moderate
members also need their corresponding Discord permissions. Place the bot's role
above roles it assigns and members it moderates.

Each server owner must run `/verify` in their own server, then use `/setup` or
`/settings`. Verification and settings are stored separately for each server.
Sharing XP or global moderation requires explicit configuration; installing the
bot in another server does not automatically join its sharing scope.

## Scripts

```bash
npm run dev
```

Runs the bot in development mode and restarts it after successful TypeScript compilation.

```bash
npm run build
```

Compiles the TypeScript source into the `dist` directory.

```bash
npm start
```

Runs the compiled bot from `dist/src/index.js`.

```bash
npm run typecheck
```

Checks TypeScript types without emitting build output.

```bash
npm run contract:emit
```

Emits the Prisma contract files.

```bash
npm test
```

Runs the unit and command tests without accessing Discord or PostgreSQL.

```bash
npm run test:database
```

Runs live PostgreSQL integration and feature end-to-end tests against `TEST_DATABASE_URL`, or
`DATABASE_URL` from `.env` when no test URL is set. Use a migrated development
database. The tests create unique synthetic server records, verify server
isolation and concurrent writes, and delete those records on completion. CI runs
this suite against a fresh PostgreSQL service after applying all migrations.

```bash
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/test_database npm run test:e2e
```

Runs the dedicated custom-command sharing workflows with the real command,
Settings, editor, ownership, execution and PostgreSQL code. Only Discord delivery
is simulated. It covers customization, selected servers, reopening saved settings,
prefix and slash execution, future installations, shared cooldowns and ownership
changes. This command requires an explicit test URL and never falls back to `.env`.

```bash
npm run build
npm run check:discord
```

Checks the configured bot token, its Gateway intents, installed server count,
and core registered slash commands, then disconnects. It does not register
commands or send messages. Run the built bot once to register commands before
checking. The check requires installation in at least two servers and reports
any missing core commands. A successful check establishes connectivity and
registration; command execution also requires owner verification in each server.

## Running the Bot

After configuring `.env`, start PostgreSQL and apply the included migrations
before starting the bot. The migration command targets `DATABASE_URL`:

```bash
npx prisma db migrate
```

Then start the bot in development mode:

```bash
npm run dev
```

For production:

```bash
npm run build
npm start
```

## License

This project is licensed under the ISC License.

## Custom commands and member events

After the server owner runs `/verify`, the owner or an administrator can use
`/custom create` to save a message command (`!trigger`), a member join response,
or a member leave response. Use `/custom list`, `/custom edit`, `/custom enable`,
and `/custom delete` to manage them. Each server can save up to 25 rules.

Responses can include `{user}`, `{username}`, `{server}`, `{channel}`, and
`{memberCount}`. Commands can also include `{args}` when **allow_args** is on.
Commands support an optional output channel, required role, admin-only access,
per-member cooldown, and embed output. Join and leave responses require an
output channel. Custom responses do not allow `@everyone` or role pings.
Only the member whose command or event triggered the response can be mentioned.
Expanded responses are truncated to Discord's message or embed description
limit. Command cooldowns are per member, rule, and server; they reset when the
bot process restarts. Failed sends release the cooldown so members can retry.

Enable the **Message Content Intent** for this bot in the Discord Developer
Portal so `!trigger` commands can read messages, then deploy the database
migration with `npx prisma db migrate` before restarting the bot.

## XP

Apply the included database migration before starting the updated bot:

```bash
npx prisma db migrate
```

XP is off by default. After verifying the server, a member with Manage Server
permission can enable it with `/settings` → **XP** → **Enable XP**.
By default, members earn 15 XP per message, with a persisted 60-second cooldown
per member per server. Bot, webhook, and system messages are excluded. Message XP
does not inspect message content; the bot requests Message Content Intent for
custom commands.

- `/xp rank` shows your XP and level; use the `user` option to view another member.
- `/xp leaderboard` shows the top 10 earners for the configured sharing scope.
- **This server** counts only XP earned in this server.
- **Global** combines XP from all enabled servers that choose global sharing.
- **Selected servers** combines XP with selected servers. Both servers must
  enable XP, use selected sharing, and select each other. Up to 25 servers
  are supported.
- **Choose Servers** → **Clear Selection** clears the selected list.

Level thresholds are `100 × level²` total XP. XP stays stored against the server
where it was earned. Changing sharing settings changes the displayed totals
without copying or deleting XP. Disabling XP stops earning and sharing; that
server can still view its own saved XP. Shared leaderboards include all earners
in the sharing scope, including members who have since left those servers.

### XP earning options

Use `/settings` → **XP** → **Ways to earn XP** to select **Messages**,
**Reactions**, **Daily claim**, or any combination. Messages remain the default
for existing servers. XP must also be enabled in the XP screen.

| Setting | Default | Allowed values |
| --- | --- | --- |
| `xp-message-amount` | 15 XP | 1–10,000 |
| `xp-reaction-amount` | 5 XP | 1–10,000 |
| `xp-daily-amount` | 100 XP | 1–10,000 |
| `xp-cooldown` | 60 seconds | 10–3,600 seconds |

The cooldown applies independently to messages and reactions. Reaction XP goes
to the member adding the reaction to another human member's message; self,
bot, webhook, and system-message reactions do not count. Removing and re-adding
reactions does not bypass the cooldown. The bot needs View Channel and Read
Message History to fetch uncached messages for reactions.

Members use `/xp daily` to claim the configured daily reward once every 24 hours
per server. Its cooldown is independent of message/reaction activity and cannot
be shortened with `xp-cooldown`. Changing methods or amounts preserves saved XP
and cooldown timestamps. All earning methods use the configured sharing scope.

Example: select all three earning methods, then use **Edit Rewards** to set
message XP to 20, reaction XP to 10, daily XP to 200, and cooldown to 90 seconds.
Apply the included earning-options migration with `npx prisma db migrate` before
running the updated bot.

### Interactive XP settings and multiple servers

Run `/settings` and open **XP** to enable XP, select multiple earning methods,
edit rewards and cooldowns, or choose a sharing scope. **Choose Servers** opens
a dropdown of servers you belong to where Centerify is installed. Select servers
by name, then click **Save Servers** to enable selected sharing here. Each other
server must also enable XP, use selected sharing, and select this server.
Saving refreshes the XP screen. These controls are available for ten minutes
and only the administrator who opened settings can use them.
Selections stay checked across pages; **Clear Selection** removes all selected
servers, and **Cancel** leaves settings unchanged. Existing peers that are no
longer listed stay selected until cleared or edited using server IDs.
Choose **Apply XP to Servers**, select from servers you manage, and click
**Apply to Selected** to copy the current XP configuration to up to 25 servers
including the source. Applying replaces the target servers' XP settings.
The **Enter Sharing Server IDs** and **Apply Using Server IDs** buttons remain
available for manual entry.
Centerify must be in each server, its current owner must have verified it,
and you must have Manage Server permission in every server. The whole group
is saved in one transaction after these checks. With selected sharing, the
servers in the group are added as mutual peers; previously selected peers
are retained. Server-specific channels, roles, and greeting settings stay local.

All server configuration is available as buttons in both `/setup` and `/settings`:
XP, Welcome, Goodbye, Auto Role, Logging, and Global Moderation. Use `/setup`
for the guided configuration flow or `/settings` for the summary and quick edits.
The separate `/welcome` and `/logging` commands have been removed.
Use **Welcome → Test** in settings to preview a greeting. Command registration
replaces the command list on startup so removed commands disappear after a restart.

### Global custom commands

Every verified guild can manage independent custom commands with `/custom create`,
edit them with `/custom configure`, and execute them with `!name` or `/custom run`.
In `/settings`, **Custom Commands** adds Components V2 dropdowns to select an
existing command and use it in this server, all eligible servers, or specific
servers. **Customize** reuses the command editor. Sharing uses one definition;
eligible servers require verified ownership and the sharing administrator's
current Administrator permission. Save the scope after reviewing the selection.
See [custom-command configuration, security and deployment](docs/custom-commands.md)
for response types, permissions, import/export, limits and migration instructions.
