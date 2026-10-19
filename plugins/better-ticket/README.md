# Better Ticket

A separately packaged Centerify module, installed through the native terminal
marketplace. Its Discord commands appear after installation, enabling and a
bot restart. The existing `/ticket` system remains independent.

## Setup

1. Install `better-ticket` through the native marketplace and restart Centerify.
2. Have the server owner run `/verify` if needed.
3. Create a support category, a dedicated support role below the bot and manager,
   and a private transcript text channel.
4. Run `/bticket setup profile:support category:Support support_role:Support transcripts:ticket-logs`.
5. Run `/bticket panel channel:help` to publish a department menu.

Add departments such as `billing`, `reports` or `applications` with their own
categories, support roles, transcript destinations and forms. Panels can show
one department button or a menu of all enabled departments and survive restarts.

Configuration requires Manage Server and visibility/management access to the
categories. The bot needs Manage Channels, Manage Roles, View Channel, Read
Message History, Send Messages, Attach Files, Embed Links, Add Reactions, Create
Public Threads, Create Private Threads and Send Messages in Threads. Thread
permissions are used to write deny overwrites. Administrator is not required.
Transcript channels must be hidden from everyone.

## Commands

All commands start with `/bticket`. Responses are private. Panels, ticket welcome
messages, saved replies and ticket controls appear in their selected channels.
User-supplied text does not send mentions.

| Command          | Function                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `setup`          | Create/update a department, category, support role, transcript destination, optional archive category, title and welcome text.           |
| `configure`      | Enable/disable a department, set active-ticket limits (1–5), cooldown, required opening role, staff-only closing and inactivity timeout. |
| `form`           | Set up to five unique intake questions, one per line. Prefix optional questions with `?`; use `none` to disable the form.                |
| `profiles`       | List departments or remove one with confirmation; retain existing tickets.                                                               |
| `panel`          | Publish a department button or a multi-department menu.                                                                                  |
| `open`           | Start a ticket after completing its form.                                                                                                |
| `claim`          | Claim a ticket; managers can assign another staff member with `member`.                                                                  |
| `unclaim`        | Release your claim; managers can release another member's claim.                                                                         |
| `priority`       | Choose Low, Normal, High or Urgent.                                                                                                      |
| `rename`         | Rename an open ticket channel.                                                                                                           |
| `close`          | Save a transcript and retain the channel as read-only. Button-based closing asks for confirmation.                                       |
| `reopen`         | Staff: reopen subject to the creator's blocklist and active-ticket limit.                                                                |
| `add` / `remove` | Staff: manage additional participants.                                                                                                   |
| `note`           | Staff: add a private note or read the latest three notes.                                                                                |
| `transcript`     | Generate HTML, archive it privately and return a private download.                                                                       |
| `delete`         | Staff: confirm deletion of a closed channel after archiving; retain metadata.                                                            |
| `rate`           | Creator: one-time 1–5 rating and feedback on a closed ticket.                                                                            |
| `queue`          | Staff: paginated queue sorted by priority and age.                                                                                       |
| `stats`          | Staff: volume, claims, ratings, first response and resolution averages.                                                                  |
| `block`          | Manager: block/unblock a member from new tickets.                                                                                        |
| `reply`          | Staff: send a saved reply; managers supply `text` to save/replace one.                                                                   |
| `info`           | View status, owner, priority, claim, participants, rating and archived transcript link.                                                  |

Configuration changes apply to future tickets. Existing tickets keep snapshots
of their department settings so a later role change cannot expose old tickets
to another team. Active-ticket limits count a member's tickets across departments.
Disabling/removing a department stops new openings from its old panels.

## Privacy, recovery and limits

Commands, buttons and submitted forms check ownership verification and command
role restrictions. Showing a modal has no ticket side effect; submission checks
authorization and form revision. Staff notes are excluded from participant views
and transcripts. Staff queue/statistics views cover their own departments;
managers can view all. Discord administrators retain their normal override.

Ticket transitions are persisted before Discord changes. Maintenance runs once
per minute, honors ownership verification and retries unfinished operations after
two minutes. Creation recovery finds orphan channels by reserved topic. Loss of
transcript access prevents closing/deletion until permissions are fixed.

Retention limits per server: 10 departments, 20 saved replies, 100 blocked members,
1000 ticket records, 8 MiB saved state. Per ticket: 25 extra participants,
50 private notes and the latest 100 audit events. Back up the state directory;
an operator must export/archive old records before reaching retention limits.
Run one Centerify process per Discord application.

Transcripts include up to the latest 2000 messages and 2 MiB of generated HTML.
Partial exports are marked; earlier messages remain in Discord. HTML is escaped
and scripts are blocked. Attachment links are included without embedding the
files and may expire. Archived messages remain in the private transcript channel.

This package supplies the Discord workflow. It does not include a hosted web
dashboard, AI replies, billing integrations or a hosted transcript service.
Design references included the official [Ticket Tool documentation](https://docs.tickettool.xyz/)
and the documented [Ticket Tool support workflow](https://ticket-tool.app/docs/discord-commands).
