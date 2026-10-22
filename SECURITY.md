# Security policy

## Reporting a vulnerability

Use the repository's [private vulnerability reporting](https://github.com/Centerify/centerify-bot-discord/security/advisories/new)
when available. If GitHub does not offer private reporting, ask maintainers in an
issue for a private contact without disclosing exploit details or sensitive data.

Include affected commits, reproduction steps, impact, and any proposed fix.
Never submit real Discord tokens, database passwords, or private server content.
Maintainers have not published a guaranteed response time or support window;
deployments should track reviewed fixes on the current default branch.

## Operator responsibilities

Keep secrets outside version control, restrict access to Docker and environment
files, rotate exposed credentials, and test recovery from backups. Trusted
plugins run inside the bot process and can access its credentials and data.
Review packages before installation.

See [security boundaries](docs/security.md) for authorization and dependency
checks, and [deployment](docs/deployment.md) for container hardening, monitoring,
upgrades, backups, and recovery.
