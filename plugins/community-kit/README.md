# Community Kit

An optional, trusted example plugin. It is **not installed or activated by default**.

An operator installs it with `centerify-plugins.cmd install community-kit`, verifies
it with `centerify-plugins.cmd verify community-kit`, and restarts the bot. A server
administrator then opens Dashboard → Plugins → Community Kit and explicitly enables
it for that server. Until then it contributes no active widgets or bot actions.

The version 1 dashboard extension contributes a community checklist, a declarative
route, an approved violet accent, and a greeting node. The node can only respond
through the host-provided message port. The plugin settings accept a bounded greeting
and reject unknown fields. Same-process code remains trusted code, not a sandbox.

See [dashboard plugin development](../../docs/dashboard-plugins.md).
