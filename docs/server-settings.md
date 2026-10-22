# Server setup and feature settings

[Documentation](README.md) · [Configuration](configuration.md) · [Management](management.md)

The current server owner must run `/verify`, then `/setup` or `/settings`.
Settings are stored independently for each server. After an ownership transfer,
the new owner must verify again. `/unverify` revokes authorization.

Apply all committed database migrations before starting this version. The
commands below assume a local Node deployment; container operators should follow
the [Compose release procedure](deployment.md#upgrades-and-rollback). This guide
describes per-server settings. Process identity, modules and logging live in
[configuration](configuration.md).

## Legacy responses and member events

After the server owner runs `/verify`, the owner or an administrator can use
`/custom create` with an explicit `kind` to save a legacy message command,
member join response, or member leave response. Use `/custom list`,
`/custom edit`, `/custom enable`, and `/custom delete` to manage them. The default
legacy limit is 25 rules per server. Omit `kind` to create a full custom command
instead; see [custom commands](custom-commands.md) for templates, actions, and limits.

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
Portal so message commands can read messages.

## Warning roles and command access

A verified server administrator with Manage Server permission can
open these controls in `/settings` or `/setup`. Changes save immediately and
apply only to that server.

Use **Warning Roles** to choose a behavior:

- **Numbered roles** adds a role for each active warning count. The name must
  include `{count}`, such as `warn{count}` or `Warning {count}`.
- **One shared role** uses an existing role selected in the picker, or creates a
  role with the configured shared name. It remains assigned until the member's
  last active warning using that role ends or is revoked.
- **No role** records warnings and expiration without assigning Discord roles.
  The bot does not need Manage Roles to issue or revoke warnings without roles.

**Names, color & duration** accepts a hex color such as `#ff0000`, a Discord color
name such as `Orange`, and a default duration from `1m` through `28d` or
`permanent`. Separate display and mentionability have their own toggles. Styles
apply when a warning role is next used; selecting an existing shared role keeps
its name. Roles must be assignable and below the moderator and bot. Existing
warnings keep their recorded role and expiration. `/warn duration:permanent`
overrides a timed server default. Global warnings use each destination server's
settings, including its default duration when no duration is supplied.

Use **Command Access** to select an enabled slash command and configure its
allowed and denied roles. An empty allowed list permits any role; otherwise the
member needs at least one allowed role. A denied role always blocks access,
including administrators. These lists add restrictions while preserving the
command's Discord permission requirements. **Reset access** removes that
command's role rules. `/settings`, `/setup`, `/verify`, and `/unverify` retain
their existing permission checks so administrators can recover configuration.
For individual custom commands, use `/custom configure` → **Access rules**;
those restrictions apply to both prefix and slash execution. The `/custom` rule
in Command Access applies to the slash command group.

Existing servers default to numbered `warn1`, `warn2`, etc., permanent warnings,
and unrestricted role access to commands.

## XP

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

| Setting              | Default    | Allowed values   |
| -------------------- | ---------- | ---------------- |
| `xp-message-amount`  | 15 XP      | 1–10,000         |
| `xp-reaction-amount` | 5 XP       | 1–10,000         |
| `xp-daily-amount`    | 100 XP     | 1–10,000         |
| `xp-cooldown`        | 60 seconds | 10–3,600 seconds |

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

## Shared custom commands

Every verified guild can manage independent custom commands with `/custom create`,
edit them with `/custom configure`, and execute them with `!name` or `/custom run`.
In `/settings`, **Custom Commands** adds Components V2 dropdowns to select an
existing command and use it in this server, all eligible servers, or specific
servers. **Customize** reuses the command editor. Sharing uses one definition;
eligible servers require verified ownership and the sharing administrator's
current Administrator permission. Save the scope after reviewing the selection.
See [custom-command configuration, security and deployment](custom-commands.md)
for response types, permissions, import/export, limits and migration instructions.
