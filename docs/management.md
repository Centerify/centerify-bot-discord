# Server management and support tickets

The current server owner must run `/verify` before these commands work.
Commands use the server's configured command role restrictions from `/settings`
in addition to their Discord permissions. Responses are private to the caller.

## Server settings

`/serverconfig` changes any supplied settings: `name`, `description`,
`verification`, and `afk_timeout`. It requires Manage Server for the caller
and bot. Descriptions require a Community server. `/server` still shows the
existing server information card, while `/settings` configures Centerify features.

## Channels

These commands require Manage Channels for the caller and bot. Existing channels
and parent categories must also be visible and manageable by both.

| Command                                           | Behavior                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `/channel create name type [category]`            | Create a text, voice or category channel.                                                                     |
| `/channel edit channel [name] [topic] [category]` | Rename, set a text/announcement topic or move a channel. Moving preserves its existing permission overwrites. |
| `/channel slowmode channel seconds`               | Set text slowmode from 0 to 21600 seconds; 0 disables it.                                                     |
| `/channel delete channel confirm`                 | Permanently delete the selected channel when `confirm` is true. Run from another channel.                     |

Categories cannot be nested. Ticket channels are protected from these commands
because their topics carry ticket records; use `/ticket` to manage them.
Deleting a category leaves its child channels in the server.

## Roles

These commands require Manage Roles for the caller and bot. Target roles must
be below both members' highest roles; the current server owner is exempt from
the caller hierarchy check. Everyone and integration-managed roles are protected.
The caller and bot must hold every permission on a role they manage.

| Command                                                              | Behavior                                                          |
| -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `/role create name [color] [permissions] [hoist] [mentionable]`      | Create a role with no permissions unless explicitly supplied.     |
| `/role edit role [name] [color] [permissions] [hoist] [mentionable]` | Change only supplied settings.                                    |
| `/role add member role`                                              | Give a manageable role to a member below both the caller and bot. |
| `/role remove member role`                                           | Remove a manageable role from a member.                           |
| `/role delete role confirm`                                          | Permanently delete a role when `confirm` is true.                 |

Colors accept six hex digits, such as `#5865F2`. Permissions use comma-separated
Discord names, such as `ViewChannel,SendMessages,ReadMessageHistory`. Unknown
names and permissions absent from either the caller or bot are rejected.
Edits preserve permissions when that option is omitted. API-supplied empty
permission strings clear them. The bot and server owner cannot be assignment
targets. Auditable changes include the invoking member's ID in Discord's audit reason.

## Tickets

First apply migrations and restart the built bot so it registers the commands:

```sh
npx prisma db migrate
npm run build
npm start
```

Create a support category and a dedicated staff role, then run:

```text
/ticket setup category:Support support_role:Support Team
/ticket panel channel:help
```

Setup and panel publishing require Manage Server. Setup also requires the caller
to view and manage the category. The support role must be below the caller and
bot, with the usual server-owner hierarchy exemption. The bot needs Manage
Channels and Manage Roles, View Channel, Send Messages, Read Message History,
Attach Files, Embed Links, Add Reactions, Send Messages in Threads, Create Public
Threads and Create Private Threads in the server and support category. Thread
permissions are needed to write the explicit deny overwrites used by tickets.
The bot is not required to have Administrator.

| Command                               | Behavior                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| `/ticket setup category support_role` | Save server-specific configuration and enable new tickets.                                   |
| `/ticket disable`                     | Stop new tickets, including old panel buttons; retain existing tickets.                      |
| `/ticket panel channel [message]`     | Publish an open-ticket button that continues working after restarts.                         |
| `/ticket open [subject]`              | Open a private ticket or return a link to your existing open ticket.                         |
| `/ticket close`                       | Close the current ticket; keep participants' read access and retain messages.                |
| `/ticket add member`                  | Staff: give an additional member access to an open ticket.                                   |
| `/ticket remove member`               | Staff: deny an additional member access.                                                     |
| `/ticket delete confirm`              | Staff: permanently delete the current closed ticket and its messages when `confirm` is true. |

The ticket creator, configured support role, bot, and Discord administrators
can view new tickets. Discord's Administrator permission bypasses channel
overwrites. Only the creator, support staff, members with Manage Channels, and
server owner can close a ticket. Adding/removing participants and deleting
closed tickets require support staff, Manage Channels, or the server owner.
Support role members and administrators retain access through their roles and
cannot be removed with a participant overwrite. Closing blocks messaging,
reactions and thread creation for ordinary participants; administrators retain
their Discord override. Mentions in subjects and panel text do not send pings.

Configuration is stored in PostgreSQL's per-server `ticketSettings` field. The
additive migration is `20261019T0709_add_ticket_settings`. Ticket owner, support
role, bot and state are recorded in each channel's reserved topic. Existing
tickets retain their original support role when setup changes. Do not edit
ticket topics or synchronize their permissions with a category manually.

The bot fetches ticket channels from Discord to find existing tickets after a
restart. Locks prevent overlapping ticket actions in one application process;
run one Centerify instance for a given Discord application. Closing retains the
channel as the history record; there is no separate transcript export. Clean up
closed tickets when approaching Discord's channel/category limits.

The `management` and `tickets` modules can each be disabled through
`CENTERIFY_MODULES`; both depend on `guilds`. `/help` lists enabled commands.
