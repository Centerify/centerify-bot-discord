# Centerify Discord Bot

Centerify is a Discord bot built with TypeScript, Sapphire Framework, Discord.js, and Prisma. It is designed to help manage Discord servers from one bot.

## Features

- Discord slash command support with Sapphire Framework
- Message XP, levels, and a leaderboard with server, global, or selected-server sharing
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

## Running the Bot

After configuring `.env`, start the bot in development mode:

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

## XP

Apply the included database migration before starting the updated bot:

```bash
npx prisma db migrate
```

XP is off by default. After verifying the server, a member with Manage Server
permission can enable it with `/settings` → **XP** → **Enable XP**.
By default, members earn 15 XP per message, with a persisted 60-second cooldown
per member per server. Bot, webhook, and system messages are excluded. Message content is
not read, so the Message Content intent is not required.

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
