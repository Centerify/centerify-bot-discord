# Command builder and runtime

The React Flow canvas and accessible outline edit the same version 1 JSON
definition. The builder supports node search, dragging, connections, zoom/pan,
minimap, keyboard movement, duplication, undo/redo, autosaved drafts, response/embed
previews, import/export, test, publish, disable, history and rollback.

```json
{
  "version": 1,
  "name": "hello",
  "description": "A friendly hello",
  "nodes": [
    {
      "id": "start",
      "kind": "trigger",
      "label": "Start",
      "position": { "x": 0, "y": 0 },
      "config": { "event": "command" }
    },
    {
      "id": "reply",
      "kind": "response",
      "label": "Respond",
      "position": { "x": 260, "y": 0 },
      "config": { "text": "Hello {user.id}!" }
    }
  ],
  "edges": [{ "id": "e1", "source": "start", "target": "reply", "port": "next" }]
}
```

Run published command workflows with `/flow name:hello arguments:...`. The bot
registers `/flow` only when the dashboard bridge is configured. Member-join triggers
need a channel ID and the current guild owner as publisher; their first argument
is the joining member ID. Reads of arguments are zero indexed. Supported values
are strings, numbers and booleans; named values use `{name}` and the actor ID uses
`{user.id}`. No JavaScript, shell commands, external HTTP calls or arbitrary templates
are evaluated.

| Kind             | Configuration                                                                          |
| ---------------- | -------------------------------------------------------------------------------------- |
| trigger          | event: command/memberJoin; channelId for memberJoin                                    |
| argument         | name, index 0–24, type string/number/boolean, optional default                         |
| variable         | name, value                                                                            |
| permission       | supported Discord permission; yes/no outputs                                           |
| branch           | variable, operator equals/contains/greater, comparison value                           |
| cooldown         | seconds 1–86400; per guild/workflow/node/actor                                         |
| response / error | text; error text may use `{error}`                                                     |
| embed            | title, text, integer color                                                             |
| components       | text plus HTTPS link/label, or informational select options                            |
| action           | allowlisted moderation/role action, target userId, reason, roleId/durationMs as needed |
| ticket           | close/reopen current built-in ticket, department/channel checks enforced               |
| delay            | ms 0–5000                                                                              |
| reuse            | ID of a reusable response/embed/action/plugin node; no recursive calls                 |
| plugin           | installed trusted action ID and input text; guild activation required for live use     |

Buttons currently support HTTPS links. Select menus are explicitly informational
and disabled; action-bearing component responses use the existing custom-command
definition editor and its shared action executor. The UI does not suggest that an
informational select can run an unpublished callback.

Schema validation bounds workflows to 50 nodes/100 edges, rejects unknown node kinds,
duplicate IDs, missing nodes, duplicate output ports, unreachable nodes and cycles.
Drafts may be incomplete; test and publication require full validation. Branch/check
nodes use yes/no outputs; the bottom output handles errors. Unconnected outputs end
the path. The outline lets keyboard and mobile users select the same connections.

Each executed step rechecks membership, verification, channel permissions and the
current published definition. Sensitive effects use the existing allowlisted bot
action service, never the author’s stored privileges. Runs stop before further steps
after cancellation, permission revocation, disablement or a changed definition.
There is a 50-step limit, 100 concurrent runs and a 15-second between-step deadline.
Already submitted Discord requests cannot be undone or forcibly cancelled.

Safe tests run the same branching/value engine but do not call effect ports,
reserve live cooldowns, sleep, send messages, moderate users or change tickets.
Execution traces record visited nodes, outcomes and durations in the authorized
audit log. Command and member-event invocations reserve deterministic operation
keys to prevent duplicate delivery of the same trigger from repeating effects.

Draft saves use atomic revisions; stale editors get a conflict. Published versions
are immutable snapshots in bounded history. Rollback revalidates and publishes a
selected snapshot. Browser-local draft snapshots are recovery copies, not a second
authoritative runtime definition. The PostgreSQL published record is authoritative.
