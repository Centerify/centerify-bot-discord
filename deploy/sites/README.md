# Centerify on Sites

This framework scaffold builds the latest repository dashboard for Cloudflare
Workers. Dashboard pages, components, API routes, and shared validators are copied
from their authoritative sources by `scripts/prepare-sites.mjs`; do not maintain
another dashboard implementation here.

The `Build Sites dashboard` GitHub Actions workflow installs dependencies, builds
the Worker, starts the built application, and runs the existing HTTP demo smoke
checks. It uploads the Worker output and the resolved npm lockfile. Installation
and execution happen on the GitHub runner. No production secrets are needed for
the demo checks. The first successful cloud build records its resolved dependency
versions in the artifact; dependency resolution is not yet frozen in this scaffold.

The workflow runs on pushes to `codex/sites-deployment` or manual dispatch once
the workflow is available on the repository's default branch. A green build and
its artifact are not a Sites publication. Use the Sites source synchronization,
packaging, saved-version, and private deployment workflow to publish the exact
verified source and output. The existing Site identity is preserved in
`.openai/hosting.json`. Never create a replacement Site just to retry deployment.

Enable `CENTERIFY_DASHBOARD_DEMO=true` in Sites to offer the isolated sample
workspace alongside Discord sign-in. Demo state is temporary and can reset when a
Worker is recycled. The Site should remain private unless the owner requests a
different audience.

Real Discord access additionally requires the following hosted runtime settings:

- `AUTH_URL`: the canonical Site origin.
- `AUTH_SECRET`: a strong secret stored in Sites.
- `AUTH_DISCORD_ID` and `AUTH_DISCORD_SECRET`: the existing Discord application's
  OAuth credentials, with the secret stored in Sites.
- `CENTERIFY_DASHBOARD_BRIDGE_URL`: an HTTPS origin that can reach the running bot.
- `CENTERIFY_DASHBOARD_BRIDGE_SECRET`: the bot's shared signing secret, stored in
  Sites.

Register `AUTH_URL/api/auth/callback/discord` in the Discord application. The bot
and PostgreSQL remain on their existing host. ChatGPT access to the Site does not
replace Discord identity or the bot's per-action permission checks. Never put
credentials into this scaffold, a workflow, an artifact, or the hosting manifest.
