# Guild custom commands

The feature is available to every verified Centerify guild. Definitions, aliases,
permissions, statistics and caches belong to their source `guildId`. Commands run
in that server by default; administrators can share an existing definition through
Settings without creating copies. Existing member-join/member-leave rules and legacy message
commands remain available. A `kind` option explicitly selects the legacy format;
leave it unset for the new custom-command domain.

## Administrator quick start

After the server owner runs `/verify`, an administrator can create:

```text
/custom create name:welcome response:Welcome {user.mention} to {guild.name}! cooldown:10
```

Members can execute either:

```text
!welcome
/custom run command:welcome
```

For Alex in Centerify Community, the response is:

```text
Welcome @Alex to Centerify Community!
```

To use arguments, store `Hello {args.0}` and run `!hello John` or
`/custom run command:hello args:John`. Arguments split on whitespace; there is no
shell quoting or interpretation. `{args}` joins all arguments with spaces.

`/custom create` and `/custom edit` expose descriptions, aliases, trigger type,
cooldown duration/scope, initial allowed/denied roles and channels, required user
and bot permissions, enabled state, reply behavior and invocation deletion.
Permission names use Discord.js names, for example `ManageMessages BanMembers`.
Use `none` to clear aliases or permission lists. Use `/custom configure` to clear
or choose multiple roles/channels.

`/custom configure name:welcome` opens a private, three-minute editor:

- **Responses** offers **Edit Template**, **Download .txt**, and **Syntax & example**.
  Write the whole response sequence as one template. Submitting parses, validates,
  and saves all responses together. Invalid submissions keep the saved definition
  intact and retain your draft in the open editor for correction.
- **Preview** renders saved responses and interactive buttons privately with sample
  arguments using your current server/member context. It does not execute the
  command, enforce command access rules, record usage, reserve cooldowns or delete
  messages.
- **Variables** shows the available placeholders directly inside Discord.
- **Access rules** selects allowed/denied roles/channels with Discord selectors,
  or edits permission names. Empty allowed lists impose no restriction. Empty
  denied lists deny nobody.
- **Settings** edits description, aliases, cooldown/scope and flags. Its flags
  field accepts `enabled,reply,delete`; omitted flags are false.

Edits save immediately. Every save rechecks the administrator's current membership,
Administrator permission, guild ownership verification, and guild-local references.
If another administrator changes the command, reopen the editor before saving.
Modal submissions expire after 90 seconds. A modal opened near session expiry may
still finish its authorized save, but the closed editor's controls stay removed.

Other actions are `/custom info`, `/custom list page:2`, `/custom enable`,
`/custom disable`, `/custom delete`, `/custom rename` and `/custom clone`. Clones
copy configuration without aliases, usage counts or the original author's audit
metadata. List pages respect both the item count and Discord's text limit.

The parent command is visible to members so `/custom run` works without granting
administrative access. Management still requires server-side Administrator access
(or server ownership). Discord integration command overrides can further restrict
availability; they never replace server-side checks. Administrative replies and
execution acknowledgements are ephemeral; executed responses are public.

## Markdown response templates

Only server owners and administrators may use the editor or upload templates.
Use `/custom configure name:welcome` → **Edit Template** to replace the command's
responses. The following example sends one embed with a **Rules** button. Clicking
it opens the rules on the same message. A longer version with a **Server info** page
is in [welcome-stages.txt](welcome-stages.txt):

<!-- prettier-ignore -->
```text
@main
@title Welcome to {guild.name}!
@color Blurple
@thumbnail {user.avatar}
Hello {user.mention}! Choose an option below.
@button primary [Rules](Go(stage(1)))
@button danger [Close](Cancel)

@stage(1)
@title Server Rules
@color #ed4245
1. Be respectful.
2. No spam or advertising.
3. Keep discussions in the right channels.
Read the full rules in:
@channel 123456789012345678
@button secondary [Back](Back(stage(0)))
@button danger [Close](Cancel)
```

Put `@main` on the first line. Each `@stage(n)` starts another embed. Stage numbers
must be unique; use `@main` for stage zero. Put every `@` directive at the **start of
its line**, with no spaces before it. Lines without `@` become the embed description.
You can use up to five stages and five buttons per stage.

### Syntax reference

| Syntax                                               | What it does                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| `@main`                                              | Defines the first page                                               |
| `@stage(1)`                                          | Defines page 1; use another number for another page                  |
| `@button primary [Rules](Go(stage(1)))`              | Blue button that opens page 1                                        |
| `@button secondary [Back](Back(stage(0)))`           | Gray button that opens page 0; Back names its destination explicitly |
| `@button success [Home](Main)`                       | Green button that opens `@main`                                      |
| `@button danger [Close](Cancel)`                     | Red button that removes the controls                                 |
| `@button [Website](https://example.com)`             | Link button that opens an HTTPS URL                                  |
| `@title Text`                                        | Embed title                                                          |
| `@color Blurple`, `@color #5865f2`, or `@color #abc` | Discord color name or hex color                                      |
| `@thumbnail URL`, `@cover URL`                       | Small thumbnail or large image                                       |
| `@field Name` … `@endfield`                          | Field name and its multiline value                                   |
| `@inline true` or `@inline false`                    | Field layout; place inside a field                                   |
| `@channel CHANNEL_ID`                                | Show a clickable mention of that channel, including inside a field   |
| `@footer Text`                                       | Footer text                                                          |

Button styles are `primary` (blue), `secondary` (gray), `success` (green), and
`danger` (red). Omit the style for an HTTPS link button. The action names are
case-insensitive. `Cancle` is also accepted as an alias for `Cancel`.

For `@channel`, replace `123456789012345678` with the real channel ID. In Discord,
enable **Developer Mode**, right-click the channel, and choose **Copy Channel ID**
([Discord's instructions](https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID)).
You can also paste an existing channel mention, such as
`@channel <#123456789012345678>`. The shortcut expands to Discord's normal
`<#CHANNEL_ID>` mention. To mention the channel where the command was run, use
`{channel.mention}` instead.

For the remaining embed options:

| Directive                                             | Meaning                                   |
| ----------------------------------------------------- | ----------------------------------------- |
| `@url URL`                                            | Title link                                |
| `@author Text`, `@author-icon URL`, `@author-url URL` | Author name, icon and link                |
| `@footer-icon URL`                                    | Footer icon                               |
| `@timestamp true`, `false`, or ISO date               | Current time, no timestamp, or fixed time |

Link buttons work with both text and embed messages, with up to five per message.
They open HTTPS URLs and do not run commands or change roles. Labels support
variables and are limited to 80 characters after expansion; button URLs are static,
credential-free HTTPS URLs of at most 512 characters. Escape brackets and backslashes
in labels with a backslash. The parser rejects unknown directives, duplicate embed
properties, incomplete blocks, invalid URLs, unsupported variables and oversized
output before saving anything.

For plain text, paste ordinary Discord Markdown. For multiple messages or text
pages, write separate `:::text` or `:::embed` blocks and close each with `:::`.
Put `@main` or `@stage(n)` inside its own block if those messages should be
interactive. Without stage markers, the bot sends all blocks in order.

Only the member who invoked the command can navigate its message. A click replaces
the current message, clearing previous text or embeds as needed. Controls expire
after 15 minutes or a bot restart; timeout removes the buttons. Navigation reuses
the rendered snapshot from invocation, including variables and timestamps, and
does not consume cooldowns or increase usage. Private previews support the same
navigation. Unknown destinations, duplicate stages, mixed staged/unstaged
responses and malformed actions are rejected before saving.

Prefix a literal directive or block-marker line with a backslash, e.g.
`\@title This is ordinary text`. Closed backtick/tilde code fences keep their
contents literal. Single-value directives accept JSON-quoted strings when newlines,
leading/trailing spaces, or a leading quote must be preserved. Downloaded templates
add quoting and escaping automatically. Variables are still substituted in text,
including code blocks; code is never executed.

The modal accepts 4,000 characters. For larger templates, use **Download .txt**, edit
the file, then run `/custom template name:welcome file:<your-file.txt>`. Uploads
accept regular and ephemeral Discord attachments. `/custom markdown` remains an
alias. Files may use `.txt`, `.md` or `.markdown`, with a 192,000-byte download limit and a
48,000-character source limit. Parsed definitions still obey all normal response
limits, including the 24,000-character JSON payload limit. File downloads use the
same Discord-host allowlist, redirect rejection, timeout and stream-size checks
as JSON imports.

Saving replaces all response messages, leaving permissions, sharing, aliases and
cooldowns unchanged. Markdown is converted into the existing structured response
storage; no database migration is required. Reopening or downloading produces
canonical Markdown from the saved definition, preserving text, embed settings,
field order and link buttons. Existing commands, JSON imports/exports and shared
commands use the same validation and rendering path. Updates to shared commands
still require management access in both servers and save to the original definition.

## Global and selected-server commands

Open `/custom options` to configure sharing, or open `/settings` and press
**Custom Commands** in the existing settings controls.
The private Components V2 panel has separate dropdowns for commands to share
together and one command to customize. Choosing **Customize** never clears your
batch sharing selection. Choose any command in the customization dropdown and
press **Only This Command** to set that command's scope independently. Command
selections persist across pages. **Save Scope** applies the displayed scope to
the sharing selection:

- **This server only** keeps the command local and removes any sharing reference.
- **All eligible servers** shares it with verified servers where the administrator
  who saved the scope has Administrator permission (or owns the server) and
  Centerify is installed. Eligible servers added later are included automatically.
- **Specific servers** opens a paginated server dropdown. Choose up to 100 other
  servers; selections survive page changes. The source server also keeps the command.

Press **Save Scope** to persist a scope change. If a command name or alias already
exists in an eligible destination (including legacy triggers and other shared
commands), a separate private warning embed appears with Keep Existing, Replace Existing, and Cancel buttons; the
settings panel stays in place. **Keep Existing** saves the scope without
replacing any commands. **Replace Existing** permanently removes conflicting server custom commands (including all their aliases) and saves the scope atomically, allowing the global command to run. Replacement is unavailable for legacy triggers and incoming shared commands; a local command that is itself shared must have its sharing removed first. Changed definitions require a fresh review. **Cancel** stops the remaining saves. Batch saves run in
order; the panel reports completed and pending commands if a duplicate or error
interrupts saving. **Keep Existing** resumes at the conflicting command. Changing the
selection invalidates the confirmation. Warning buttons expire after two minutes
and are removed when cancelled, consumed, or when settings close. Confirmation rechecks permissions and duplicate
names; new conflicts require another warning. Local commands still take precedence,
and ambiguous shared names remain unavailable. All-server checks cover currently
eligible destinations; later additions and command edits can introduce conflicts.
If Discord cannot acknowledge a click, that action is not applied and earlier
inputs are preserved. Retry the input or use Refresh to review the panel before
Save Scope is enabled again.

Inputs update the panel immediately. Refresh reloads command details and eligible
servers while preserving unsaved scope and server selections. Switching commands
also preserves their drafts. Customize saves command edits immediately and updates
the settings panel automatically. Saving reloads the latest command definitions.
Closing or expiry after ten minutes discards unsaved scope changes and disables
the panel's controls. No additional slash command is registered.

Shared commands keep one definition: changes to responses, aliases, enabled state
and permission requirements apply everywhere. `!name` and `/custom run command:name`
both resolve shared commands. Variables describe the server, channel and member
where the command is invoked. Usage stays on the source definition; GLOBAL_COMMAND
cooldowns span eligible servers, while GUILD cooldowns remain per invocation server.

`/custom list` and `/custom options` include commands shared with the current
server, including disabled commands that need to be re-enabled. The list labels
each command Local, Global, or Specific servers and identifies shared sources.
Customize and `/custom configure` edit the original definition from any eligible
server. The editor must have Administrator permission (or own the server) in
both the original and current verified servers. Sharing eligibility and access
are checked again for each save. Scope changes from a destination also update
the original grant; **Original server only** withdraws sharing. Duplicate names
can be distinguished by their source in the options dropdowns. No copies are made.

Ownership verification and the sharing administrator's current access are checked
in both source and destination. Losing either stops remote execution. Existing local
commands and legacy triggers take precedence. Conflicting shared names or aliases
are not executed; rename one or narrow its scope. Removing a command automatically
removes its sharing reference. Clones and exports retain local-only scope by default.

Role and channel IDs belong to one Discord server. Clear all allowed/denied role
and channel restrictions in Customize before sharing a command. Discord permission
requirements such as ManageMessages work across servers. If server-specific
restrictions are added later, remote execution stops until they are cleared.

Apply `migrations/app/20261002T0928_add_custom_command_sharing` with
`node_modules/.bin/prisma db migrate` before running this version of the bot. The
implementation follows [Discord's Components V2 reference](https://docs.discord.com/developers/components/reference).

## Templates, output and mentions

Available variables (also listed by the editor's **Variables** button):

```text
{user.id} {user.name} {user.displayName} {user.mention}
{user.globalName} {user.avatar} {user.defaultAvatar} {user.createdAt} {user.bot}
{member.avatar} {member.nickname} {member.joinedAt} {member.boostingSince}
{member.color} {member.topRole} {member.roleCount}
{guild.id} {guild.name} {guild.memberCount} {guild.ownerId} {guild.createdAt}
{guild.icon} {guild.banner} {guild.description} {guild.boostCount}
{guild.boostTier} {guild.locale}
{channel.id} {channel.name} {channel.mention} {channel.topic}
{channel.createdAt} {channel.type} {channel.nsfw} {channel.parentId}
{bot.id} {bot.name} {bot.mention} {bot.avatar}
{command.name} {command.description} {command.usageCount} {command.cooldown}
{command.prefix} {command.source}
{date} {time} {datetime} {timestamp}
{args} {args.count} {args.first} {args.last} {args.0} ... {args.24}
```

These are runtime placeholders, not the host's environment variables; secrets and
`.env` values are never exposed. Optional unavailable values return empty strings.
`member.roleCount` excludes @everyone; `member.topRole` is the highest role's name.
`member.avatar` includes the server avatar; `user.avatar` uses the global avatar.
`channel.type` and `guild.boostTier` are Discord numeric values. `timestamp` is Unix
seconds; other creation/join/boost dates and `datetime` use ISO 8601. Usage count is
the stored count before this execution (and may reflect the cache snapshot).

For example, create a `profile` command, then use `/custom configure name:profile`
and **Edit Template** to paste an embed template with the variables above. Use
Preview to check the saved result privately.

Dates/times use UTC. Unknown variables or unbalanced braces are validation errors.
Arguments and variable values are substituted once, without reinterpreting their
contents. The resolver registry accepts trusted application extensions. Templates
cannot execute JavaScript, SQL, shell commands, file access or arbitrary expressions.

Responses support text, a validated embed, or up to five ordered text/embed
messages. The renderer validates all expanded messages before sending any. Embed
limits follow [Discord's message documentation](https://docs.discord.com/developers/resources/message#embed-object).
Static links and media must use HTTPS without credentials. Complete placeholders
`{user.avatar}`, `{user.defaultAvatar}`, `{member.avatar}`, `{guild.icon}`,
`{guild.banner}` and `{bot.avatar}` are also accepted in URL inputs. Arbitrary
text/argument variables and mixed URLs such as `https://example.com/{args}` are
rejected. Expanded URLs are validated again before delivery. Unavailable optional
images/links are omitted; keep some text in the embed so it remains valid without
an image. URLs are passed to Discord; Centerify does not fetch them.

Every payload uses `allowedMentions: { parse: [], users: [invokingUserId], roles: [],
repliedUser: false }`. Role mentions, other user mentions, `@everyone` and `@here`
cannot notify people. Mass-mention text is additionally neutralized. Invocation
replies never implicitly ping the author. When deletion is enabled, prefix output
is sent directly to the channel, then the invocation is deleted after delivery;
this needs the bot's Manage Messages permission.

## Permissions and cooldowns

Checks run in this order:

1. Guild/member/channel identity and trigger compatibility; enabled state.
2. Denied channels, then allowed-channel restrictions.
3. Denied roles, then allowed-role restrictions.
4. User channel permissions and bot view/send/embed/deletion permissions, including
   thread send permissions and any extra configured bot permissions.
5. Cooldown reservation, rendering, ordered delivery and usage recording.

Administrators do not bypass custom command denies. Expected prefix access/cooldown
errors are quiet, matching legacy behavior; slash execution returns a private
explanation. Cooldowns support `USER`, `CHANNEL`, `GUILD` and `GLOBAL_COMMAND`.
`GLOBAL_COMMAND` spans all execution sources for the same guild-owned record; it
does not link commands with the same name in different servers.

Cooldown storage is bounded and expires entries lazily. A failed first send
releases its reservation; a partially sent multi-message response retains it to
avoid repeated spam. A failed old execution cannot release a newer reservation.
Usage is counted once only when every response is delivered. Metrics failures are
logged without retrying already delivered messages.

## Import and export

`/custom export` downloads the guild's definitions without database IDs, guild IDs,
creator identity or usage data. `/custom import file:...` accepts a Discord-hosted
JSON attachment of at most 8 MiB:

```json
{
  "version": 1,
  "commands": [
    {
      "name": "rules",
      "description": "Read the server rules",
      "content": [{ "type": "TEXT", "text": "Read <#123456789012345678>." }]
    }
  ]
}
```

Omitted configuration uses the same defaults as creation. Empty exports import as
no-ops. Unsupported versions, unknown fields, invalid payloads, permission names,
non-local roles/channels, duplicate names/aliases, reserved built-ins and excessive
limits fail before saving any command. The entire import is transactional. Imports
never overwrite existing commands. References to role/channel IDs require those
IDs to exist in the destination guild; edit the export when transferring a template.
Attachment downloads reject redirects, unknown hosts, excessive streams and timeouts.

## Implementation and deployment

`src/modules/custom-commands/discord/commands/custom.ts` routes Discord interactions to the domain's
management functions and the existing legacy rules. The existing message listener
routes `!` invocations to cached domain lookup and falls back to legacy rules.
There is no new prefix configuration system: `!` already existed in this repository.
The executor is independent of triggers and receives a normalized context and a
transport. Renderer strategies and variable resolvers are registries. The CRUD
service accepts repository and guild-reference-validation dependencies so a future
dashboard can reuse the same validations and transactions.

The contract adds `custom_command`, `custom_command_name` and
`custom_command_restriction`. Responses use JSONB; names, aliases and restrictions
use normalized columns. Unique `(guildId, name)` namespace rows cover canonical
names and aliases. Composite foreign keys preserve the command's guild identity.
SQL checks enforce normalized names, response/trigger/scope values, restriction
kinds and cooldown bounds. Guild-leading indexes support lookup and enabled/trigger
filters, with separate enabled/trigger indexes. All administrative mutations and
consistent cached snapshots use a transaction-scoped guild advisory lock shared
with legacy responses. Built-in names and aliases come from Sapphire's registered
store, with a small critical-name fallback before loading completes.

This Prisma version has incomplete composite-relation include behavior; the
repository explicitly joins guild-scoped parent/name/restriction reads by command
ID. Child replacement/deletion uses `deleteAll()`, because `delete()` removes one
row in this version. Usage counters use a parameterized atomic increment without
changing the administrative revision timestamp.

Defaults live in `src/modules/custom-commands/domain/constants.ts`: 100 commands per guild,
10 aliases, 100-character names/descriptions, 25 arguments/role/channel restrictions,
2,000-character argument input, 24,000-character response payloads and 0–86,400s
cooldowns. The service accepts an injected command-count limit for future edition
policy. Core functionality has no premium dependencies.

Guild caches are bounded to 1,000 entries, coalesce loads, and expire after 30s.
Local mutations invalidate immediately. Other bot processes observe edits after
at most the cache TTL. Cooldowns are process-local. Multi-process deployments that
require immediate invalidation and shared cooldowns should provide a shared store
and invalidation transport before relying on distributed enforcement; no Redis is
required for the current single-process deployment.

Deploy the reviewed migration before starting the updated bot:

```bash
npx prisma db migrate
npm run build
npm start
```

The migration is `migrations/app/20261001T0823_add_global_custom_commands` and
chains from the existing custom-response migration. It is additive and leaves
legacy rules intact. Restart Centerify to register the expanded `/custom` command.
Message Content intent must remain enabled for prefix execution.

Verification:

```bash
npm test
npm run typecheck
npm run build
# Against an isolated, migrated development PostgreSQL database:
TEST_DATABASE_URL=postgres://... npm run test:database
```

There is no lint script in the repository. `test:database` discovers all integration
suites and uses unique synthetic guild IDs with cleanup. Unit tests cover CRUD,
isolation, conflicts, import/export, variables, limits, mentions, permissions,
cooldowns, cache races, editor payloads, registration and management authorization.
Database tests exercise constraints, competing creations, rollback, atomic usage
and compatibility with legacy commands, XP and moderation.

`TEST_DATABASE_URL=<migrated-test-database-url> npm run test:e2e` runs the dedicated
sharing workflows in `tests/integration/customCommandSharing.e2e.test.ts`.
Settings, customization modals, verification, prefix/slash command handlers,
rendering, cooldowns, and database writes use the production implementation;
only Discord interactions and delivery are simulated. Each workflow starts with
verified synthetic servers and cleans up its rows independently. The database
suite and CI include these workflows automatically. This dedicated command
requires `TEST_DATABASE_URL`; it does not fall back to the deployment URL in `.env`.

## Implementation file manifest

Files added for this feature:

```text
src/modules/custom-commands/domain/constants.ts
src/modules/custom-commands/domain/errors.ts
src/modules/custom-commands/domain/types.ts
src/modules/custom-commands/application/CustomCommandCache.ts
src/modules/custom-commands/application/CustomCommandCooldownService.ts
src/modules/custom-commands/discord/CustomCommandExecutor.ts
src/modules/custom-commands/discord/CustomCommandGuildValidator.ts
src/modules/custom-commands/discord/CustomCommandImport.ts
src/modules/custom-commands/discord/CustomCommandPermissionService.ts
src/modules/custom-commands/discord/CustomCommandRenderer.ts
src/modules/custom-commands/application/CustomCommandService.ts
src/modules/custom-commands/discord/CustomCommandSharingService.ts
src/modules/custom-commands/domain/CustomCommandValidator.ts
src/modules/custom-commands/discord/CustomCommandVariableResolver.ts
src/modules/custom-commands/infrastructure/PrismaCustomCommandRepository.ts
src/modules/custom-commands/infrastructure/PrismaCommandSharingRepository.ts
src/modules/custom-commands/discord/editor.ts
src/modules/custom-commands/discord/editorResponses.ts
src/modules/custom-commands/discord/editorView.ts
src/modules/custom-commands/discord/legacyManagement.ts
src/modules/custom-commands/discord/management.ts
src/modules/custom-commands/discord/registration.ts
src/modules/custom-commands/discord/reservedNames.ts
src/modules/custom-commands/discord/runtime.ts
src/modules/custom-commands/discord/settings.ts
src/modules/custom-commands/discord/settingsView.ts
migrations/app/20261001T0823_add_global_custom_commands/migration.ts
migrations/app/20261001T0823_add_global_custom_commands/migration.json
migrations/app/20261001T0823_add_global_custom_commands/ops.json
migrations/snapshots/df20bae832736ee95d4cf42a28c5a77caed74127d06a719b1aa6a68c4bb623e0/contract.d.ts
migrations/snapshots/df20bae832736ee95d4cf42a28c5a77caed74127d06a719b1aa6a68c4bb623e0/contract.json
migrations/app/20261002T0928_add_custom_command_sharing/migration.ts
migrations/app/20261002T0928_add_custom_command_sharing/migration.json
migrations/app/20261002T0928_add_custom_command_sharing/ops.json
migrations/snapshots/8f45d6d1cc46b2fe3738fc8990f468c978137894031c5a92132729734c689b05/contract.d.ts
migrations/snapshots/8f45d6d1cc46b2fe3738fc8990f468c978137894031c5a92132729734c689b05/contract.json
tests/services/customCommands/attachment.test.ts
tests/services/customCommands/cache.test.ts
tests/services/customCommands/editor.test.ts
tests/services/customCommands/editorRuntime.test.ts
tests/services/customCommands/execution.test.ts
tests/services/customCommands/fixtures.ts
tests/services/customCommands/management.test.ts
tests/services/customCommands/rendering.test.ts
tests/services/customCommands/runtime.test.ts
tests/services/customCommands/service.test.ts
tests/services/customCommands/sharing.test.ts
tests/services/customCommands/settingsRuntime.test.ts
tests/services/customCommands/settingsView.test.ts
tests/integration/customCommands.test.ts
tests/integration/customCommandSharing.e2e.test.ts
docs/custom-commands.md
```

Existing workspace files extended by this feature (including pre-existing,
uncommitted custom-response work):

```text
README.md
scripts/test-database.mjs
src/modules/custom-commands/discord/commands/custom.ts
src/modules/settings/discord/commands/settings.ts
src/modules/settings/discord/renderer.ts
src/modules/custom-commands/discord/events.ts
src/prisma/contract.prisma
src/prisma/contract.json
src/prisma/contract.d.ts
src/modules/custom-commands/discord/legacyRunner.ts
src/modules/custom-commands/application/CustomResponseService.ts
tests/commands/admin/custom.test.ts
tests/commands/admin/customRuntime.test.ts
tests/commands/admin/settingsRuntime.test.ts
tests/services/customResponseRunner.test.ts
tests/services/customResponseService.test.ts
tests/integration/database.test.ts
```

The prior command-registration assertion now expects a public parent, with runtime
coverage ensuring management still requires Administrator access and only `run`
permits ordinary members. Existing ownership, moderation and legacy assertions
remain in place. Database cleanup uses `deleteAll()` to remove every synthetic row.
No existing test was disabled. No runtime dependencies were added.

Final verification on the completed implementation: **350 tests passed in 63 test
files**, including all **19 live PostgreSQL integration and end-to-end tests**, on a disposable
PostgreSQL container. The complete 12-migration chain applied successfully.
`npm run typecheck`, `npm run build`, Prettier checks for the added domain/tests and
`git diff --check` passed. The repository has no lint script. The deployment database
was not modified; apply the migration there before starting the updated bot.
