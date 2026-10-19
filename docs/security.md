# Security boundaries and validation

The security hardening keeps Discord-specific authorization in the owning
module's `discord` adapter. Domain and application code still depend on ports;
no security check requires a database connection in unit tests.

Generic custom-command input validation uses Zod 4.6.7 through the small
`domain/validation.ts` adapter. Strict schemas reject unknown fields, and the
adapter returns only the first safe validation message. Plain-object checks also
reject inherited configuration data; Centerify-specific permission, template and
Discord limits stay in the module. String checks preserve UTF-16 size limits.

## Enforced behavior

- Automatic join roles and warning roles cannot carry the administrative,
  moderation, audit-log, mass-mention or management permissions listed in
  `src/modules/guilds/discord/rolePolicy.ts`. Settings check role hierarchy and
  server identity. Join events fetch the role again, so changing a previously
  safe role's permissions does not bypass the policy. Warning-role lookup by
  name applies the same policy, preventing privileged name collisions.
- Custom role buttons continue to support ordinary opt-in roles. A privileged
  role requires the caller to have Manage Roles, every permission being granted,
  and a higher role (unless the caller owns the guild). Bot hierarchy and managed
  role checks remain mandatory. This also applies to removals and toggles.
- Every component action rechecks current guild ownership verification, current
  command content and revision, membership, bot permissions and command access.
  Previously delivered controls stop working after verification is revoked.
- Global bans, warnings and note writes require current membership and the
  corresponding permission in **each destination server**, along with current
  verification, feature opt-in and that server's command role restrictions.
  Ban and warning actions enforce the destination moderator's role hierarchy.
  Being an administrator in the source server alone confers no destination
  authority. Unauthorized destinations are skipped in the existing summary.
- Ban target lookups treat only Discord error 10007 (Unknown Member) as absence.
  Permission errors, rate limits and network failures cannot bypass hierarchy
  validation by turning an unresolved member into a non-member.
- Attachment imports retain host/path restrictions, redirect rejection, a
  timeout and streamed byte limits. They additionally reject alternate ports,
  fragments, malformed URLs and invalid declared byte counts.
- Structured `err` logs retain error type, message, stack and numeric code.
  Request bodies, response objects, nested causes and arbitrary properties are
  excluded. Configured bot/database secrets and Discord interaction/webhook
  endpoint URLs are removed from diagnostic strings. Environment variants are
  ignored by Git; `.env.example` can still be tracked.

## Checks

```sh
npm ci
npm run test:security
npm test
npm run typecheck
npm run build
npm run audit:production
```

Security tests exercise authorization failures and permitted operations through
real role, warning, join-event and global command handlers with simulated Discord
responses. Existing architecture tests enforce import boundaries on Windows and
Unix. Tests do not contact Discord. PostgreSQL integration tests require an
explicit test database and run separately with `npm run test:database`.

## Dependency audit, 2026-10-19

The lockfile pins compatible patches for `brace-expansion` (5.0.12), `sharp`
(0.35.5) and `source-map-js` (1.2.2). The production dependency audit reports zero
known vulnerabilities at this snapshot. CI rejects high or critical production
advisories. This is an advisory snapshot, not a guarantee about unknown flaws.

The full development dependency audit still reports seven high-severity package
entries from one unfixed `braces` issue, inherited through
`prisma -> @prisma/composer-cli -> @prisma/composer/alchemy -> fast-glob -> micromatch -> braces`.
The [upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
has no published patch. These are development/migration dependencies, not the
bot's production dependency tree. npm's suggested Prisma 7 downgrade is
incompatible with this project's Prisma Next data layer and was not applied.
Recheck the full audit when upgrading Prisma; do not run its development tools
against untrusted glob patterns.

## Operational limits

This change does not establish that the deployed bot, hosting account, database,
Discord application or historical Git commits are uncompromised. Use a dedicated
database account and grant the bot only the permissions its configured features
need. After building and applying migrations in a trusted deployment pipeline,
deploy runtime dependencies with `npm ci --omit=dev`. Keep development tools out
of the running bot's environment. Rotate any credentials known to have leaked.

Discord and database changes cannot be one atomic operation. Role changes made
concurrently by a server administrator can race a permission check, and unknown
vulnerabilities, malicious privileged administrators and infrastructure failures
remain outside the protection a code change can guarantee.
