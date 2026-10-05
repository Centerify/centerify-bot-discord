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

- **Responses** selects an ordered message. Edit text or embed title, description,
  color, author and footer. Media controls configure image, thumbnail, author and
  footer icons and timestamp. Add/remove embed fields and add/remove text/embed
  messages without typing JSON. Field changes can be made by removing trailing
  fields and adding replacements.
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

Available variables:

```text
{user.id} {user.name} {user.displayName} {user.mention}
{guild.id} {guild.name} {guild.memberCount}
{channel.id} {channel.name} {channel.mention}
{command.name} {date} {time}
{args} {args.0} ... {args.24}
```

Dates/times use UTC. Unknown variables or unbalanced braces are validation errors.
Arguments and variable values are substituted once, without reinterpreting their
contents. The resolver registry accepts trusted application extensions. Templates
cannot execute JavaScript, SQL, shell commands, file access or arbitrary expressions.

Responses support text, a validated embed, or up to five ordered text/embed
messages. The renderer validates all expanded messages before sending any. Embed
limits follow [Discord's message documentation](https://docs.discord.com/developers/resources/message#embed-object).
Only HTTPS media URLs without credentials or template variables are accepted.
They are passed to Discord; Centerify does not fetch them.

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

`src/commands/admin/custom.ts` routes Discord interactions to the domain's
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

Defaults live in `src/lib/customCommands/constants.ts`: 100 commands per guild,
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
src/lib/customCommands/constants.ts
src/lib/customCommands/errors.ts
src/lib/customCommands/types.ts
src/services/customCommands/CustomCommandCache.ts
src/services/customCommands/CustomCommandCooldownService.ts
src/services/customCommands/CustomCommandExecutor.ts
src/services/customCommands/CustomCommandGuildValidator.ts
src/services/customCommands/CustomCommandImport.ts
src/services/customCommands/CustomCommandPermissionService.ts
src/services/customCommands/CustomCommandRenderer.ts
src/services/customCommands/CustomCommandService.ts
src/services/customCommands/CustomCommandSharingService.ts
src/services/customCommands/CustomCommandValidator.ts
src/services/customCommands/CustomCommandVariableResolver.ts
src/services/customCommands/PrismaCustomCommandRepository.ts
src/services/customCommands/PrismaCommandSharingRepository.ts
src/services/customCommands/editor.ts
src/services/customCommands/editorResponses.ts
src/services/customCommands/editorView.ts
src/services/customCommands/legacyManagement.ts
src/services/customCommands/management.ts
src/services/customCommands/registration.ts
src/services/customCommands/reservedNames.ts
src/services/customCommands/runtime.ts
src/services/customCommands/settings.ts
src/services/customCommands/settingsView.ts
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
src/commands/admin/custom.ts
src/commands/admin/settings.ts
src/services/setup/renderer.ts
src/listeners/messageCreate.ts
src/prisma/contract.prisma
src/prisma/contract.json
src/prisma/contract.d.ts
src/services/customResponseRunner.ts
src/services/customResponseService.ts
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
