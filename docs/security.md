# Security boundaries and validation

[Documentation](README.md) · [Security policy](../SECURITY.md) · [Deployment](deployment.md)

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

## Dependency review

Run `npm run audit:production` for every release. CI rejects high or critical
runtime advisories. Run `npm audit` as well when reviewing the development and
migration toolchain; those packages ship in the migration image, even though
they are excluded from the bot image. Audit results depend on the current
advisory database and are not a permanent security guarantee.

The lockfile carries explicit overrides for patched transitive dependencies.
The existing Prisma development tree has previously reported a `braces`
advisory through the Composer CLI and glob tooling. Review current audit output
and upstream fixes when upgrading. Do not downgrade to Prisma 7 as an automatic
audit repair: it uses a different data layer. Keep development/migration tools
restricted to trusted operators and reviewed inputs.

## Container boundaries

The Compose bot runs as a non-root user with a read-only root filesystem,
dropped capabilities, and no privilege escalation. Installed plugin code is
mounted read-only; plugin registry/data are writable persistent storage. The
optional offline tools service can change both plugin volumes. Plugins execute
trusted JavaScript in the bot process, so these controls do not sandbox a
malicious package or protect secrets from it.

PostgreSQL is on an internal network with no published port. The bot and
migration job use a database-owning login without PostgreSQL superuser powers;
the administrator password stays in the database service. For stricter separation,
provision separate DDL and runtime roles with reviewed grants. Protect environment
files, Docker access, and backups. Secrets are passed in container environments
and are visible to privileged Docker operators.

Readiness is loopback-only and reports a generic status. It checks connectivity,
not Discord permission correctness or every authorization path. Resource limits
and rotating logs reduce accidental exhaustion; external monitoring and tested
recovery remain operator responsibilities. See [deployment](deployment.md).

## Operational limits

Use a dedicated database account and grant the bot only the permissions its configured features
need. After building and applying migrations in a trusted deployment pipeline,
deploy runtime dependencies with `npm ci --omit=dev`. Keep development tools out
of the running bot's environment. Rotate any credentials known to have leaked.

Discord and database changes cannot be one atomic operation. Role changes made
concurrently by a server administrator can race a permission check, and unknown
vulnerabilities, malicious privileged administrators and infrastructure failures
remain operational risks. Report suspected vulnerabilities through
[SECURITY.md](../SECURITY.md).

# Dashboard boundary

See [dashboard security](dashboard-security.md) for Discord OAuth, guild capabilities,
same-origin mutations, signed internal requests, operation deduplication, audit and
authenticated event recovery. Do not expose the internal bridge or install plugin
code by default. Package changes require trusted operators; guild ownership alone
does not grant host-level code installation rights.
