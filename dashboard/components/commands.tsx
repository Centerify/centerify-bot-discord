"use client";
import { useState } from "react";
import { Download, FileUp, LockKeyhole, Plus, SearchCheck, Terminal, Trash2 } from "lucide-react";
import { useAction, useResource } from "@/lib/client";
import type { Catalog, CustomCommand, Resources } from "@/lib/types";
import { download, relative } from "@/lib/utils";
import { useWorkspace } from "./shell";
import { Badge, Empty, Failure, Heading, Loading, Notice, SearchInput } from "./shared";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
const starter = {
  name: "hello",
  description: "A little hello for your community",
  enabled: true,
  triggerType: "BOTH",
  responseType: "TEXT",
  content: [{ type: "TEXT", text: "Hey {user.mention}! Glad you’re here." }],
  aliases: [],
  cooldownSeconds: 10,
  cooldownScope: "USER",
  allowedRoleIds: [],
  deniedRoleIds: [],
  allowedChannelIds: [],
  deniedChannelIds: [],
  requiredUserPermissions: [],
  requiredBotPermissions: [],
  deleteInvocation: false,
  replyToInvocation: true,
};
function definition(c: CustomCommand) {
  return Object.fromEntries(Object.keys(starter).map((key) => [key, c[key]]));
}
export function CommandsPage() {
  const { guild, notify } = useWorkspace(),
    [tab, setTab] = useState("builtins"),
    [q, setQ] = useState(""),
    [editor, setEditor] = useState(false),
    [original, setOriginal] = useState<CustomCommand | null>(null),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [diagnostic, setDiagnostic] = useState(false),
    [diagnosticName, setDiagnosticName] = useState(""),
    [channelId, setChannelId] = useState(""),
    [userId, setUserId] = useState(""),
    [diagnosticResult, setDiagnosticResult] = useState<{
      allowed: boolean;
      explanation: string;
    } | null>(null),
    [deleteName, setDeleteName] = useState("");
  const catalog = useResource<Catalog>(guild.id, "commands"),
    resources = useResource<Resources>(guild.id, "resources"),
    action = useAction(guild.id, "commands");
  function openEditor(command?: CustomCommand) {
    setOriginal(command ?? null);
    setText(JSON.stringify(command ? definition(command) : starter, null, 2));
    setError("");
    action.reset();
    setEditor(true);
  }
  async function save() {
    try {
      const parsed: unknown = JSON.parse(text);
      setError("");
      action.mutate(
        {
          action: original ? "update" : "create",
          name: original?.name,
          expectedUpdatedAt: original?.updatedAt,
          definition: parsed,
        },
        {
          onSuccess: () => {
            setEditor(false);
            notify("Custom command saved");
          },
        },
      );
    } catch {
      setError("Enter valid JSON before saving.");
    }
  }
  return (
    <>
      <Heading
        eyebrow="SMALL WORDS. USEFUL POSSIBILITIES."
        title="A command for every moment."
        description="Explore Centerify’s command catalog, tune custom responses, and understand access."
      >
        <Button
          variant="secondary"
          onClick={() => {
            setDiagnostic(true);
            setDiagnosticResult(null);
          }}
        >
          {" "}
          <SearchCheck size={14} />
          Diagnose access
        </Button>
        <Button onClick={() => openEditor()}>
          <Plus size={15} />
          New custom command
        </Button>
      </Heading>
      <div className="toolbar">
        <div
          className="tabs"
          style={{ marginBottom: 0, border: 0 }}
          role="tablist"
          aria-label="Command type"
        >
          {[
            ["builtins", "Built-in"],
            ["custom", "Custom commands"],
            ["legacy", "Legacy responses"],
          ].map(([id, label]) => (
            <button
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "active" : ""}
              key={id}
              onClick={() => setTab(id!)}
            >
              {label}
            </button>
          ))}
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Find a command or alias…" />
      </div>
      {catalog.isPending ? (
        <Loading label="Reading the command catalog" />
      ) : catalog.error ? (
        <Failure error={catalog.error} retry={() => void catalog.refetch()} />
      ) : (
        <>
          <div className="toolbar">
            <span className="count-label">
              <Terminal size={13} style={{ display: "inline", marginRight: 6 }} />
              Custom prefix: <code>{catalog.data.prefix}</code> · Built-in commands use /
            </span>
            {tab === "custom" && (
              <div className="toolbar-group">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    download(
                      "centerify-commands.json",
                      JSON.stringify(
                        { version: 1, commands: catalog.data.custom.map(definition) },
                        null,
                        2,
                      ),
                    )
                  }
                >
                  <Download size={13} />
                  Export
                </Button>
                <label
                  className="button button-secondary button-sm"
                  style={{ display: "inline-flex" }}
                >
                  <FileUp size={13} />
                  Import
                  <input
                    className="sr-only"
                    type="file"
                    accept="application/json,.json"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 500000) {
                        notify("Import must be smaller than 500KB", "error");
                        return;
                      }
                      action.mutate(
                        { action: "import", file: await file.text() },
                        {
                          onSuccess: () => notify("Commands imported"),
                          onError: (error) => notify(error.message, "error"),
                        },
                      );
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            )}
          </div>
          <section className="panel">
            {tab === "builtins" ? (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Command</th>
                        <th>What it does</th>
                        <th>Access</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catalog.data.builtins
                        .filter((c) =>
                          `${c.name} ${c.description}`.toLowerCase().includes(q.toLowerCase()),
                        )
                        .map((c) => (
                          <tr key={c.name}>
                            <td>
                              <strong>/{c.name}</strong>
                              {c.canonical !== c.name && (
                                <span className="cell-sub">Alias of /{c.canonical}</span>
                              )}
                            </td>
                            <td>{c.description}</td>
                            <td>
                              {c.protected ? (
                                <Badge tone="purple">
                                  <LockKeyhole size={10} />
                                  Protected
                                </Badge>
                              ) : (
                                <Badge>
                                  {c.permissions
                                    ? `Discord bitfield ${c.permissions}`
                                    : "Command checks"}
                                </Badge>
                              )}
                            </td>
                            <td>
                              <Badge>Module definition</Badge>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div className="panel-footer">
                  <span>Generated from the running bot’s authoritative command registrations.</span>
                </div>
              </>
            ) : tab === "custom" ? (
              catalog.data.custom.filter((c) =>
                `${c.name} ${c.aliases.join(" ")}`.includes(q.toLowerCase()),
              ).length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Command</th>
                        <th>Aliases</th>
                        <th>Usage</th>
                        <th>Status</th>
                        <th>Manage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catalog.data.custom
                        .filter((c) => `${c.name} ${c.aliases.join(" ")}`.includes(q.toLowerCase()))
                        .map((c) => (
                          <tr key={c.id}>
                            <td>
                              <strong>
                                {catalog.data.prefix}
                                {c.name}
                              </strong>
                              <span className="cell-sub">{c.description}</span>
                            </td>
                            <td>
                              {c.aliases.length
                                ? c.aliases.map((a) => <Badge key={a}>{a}</Badge>)
                                : "No aliases"}
                            </td>
                            <td>
                              {c.usageCount.toLocaleString()}
                              <span className="cell-sub">
                                {c.lastUsedAt ? relative(c.lastUsedAt) : "Not used yet"}
                              </span>
                            </td>
                            <td>
                              <Badge tone={c.enabled ? "success" : "neutral"}>
                                {c.enabled ? "Enabled" : "Disabled"}
                              </Badge>
                            </td>
                            <td>
                              <div className="toolbar-group">
                                <Button size="sm" variant="secondary" onClick={() => openEditor(c)}>
                                  Configure
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label={`Delete ${c.name}`}
                                  onClick={() => setDeleteName(c.name)}
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="A useful idea starts here"
                  description="Create your first custom command, or build a workflow with the visual editor."
                >
                  <Button onClick={() => openEditor()}>Create a command</Button>
                </Empty>
              )
            ) : catalog.data.legacy.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Trigger</th>
                      <th>Response</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.data.legacy.map((c) => (
                      <tr key={c.name}>
                        <td>{c.name}</td>
                        <td>{c.kind}</td>
                        <td style={{ whiteSpace: "normal" }}>{c.response}</td>
                        <td>{c.enabled ? "Enabled" : "Disabled"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="No legacy responses"
                description="Use modern custom commands and workflows for new responses. Existing legacy rules remain available through /custom in Discord."
              />
            )}
          </section>
          <Notice>
            Built-in aliases, names, descriptions, and availability use the sparse{" "}
            <code>centerify.config.json</code> layer and require a bot restart. Per-server role
            access is editable in Server settings. Verification commands retain their required names
            and availability.
          </Notice>
        </>
      )}
      <Dialog open={editor} onOpenChange={setEditor}>
        <DialogContent className="dialog-wide">
          <DialogTitle>
            {original ? `Configure ${original.name}` : "Create a custom command"}
          </DialogTitle>
          <DialogDescription>
            Edit the shared, validated command definition. Aliases, cooldowns, role and channel
            restrictions use the bot’s existing service. The visual builder is available for node
            workflows.
          </DialogDescription>
          <label>
            Command definition
            <textarea
              className="code-editor"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              aria-label="Command JSON definition"
            />
          </label>
          {(error || action.error) && (
            <Notice tone="error">{error || action.error?.message}</Notice>
          )}
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setEditor(false)}>
              Cancel
            </Button>
            <Button disabled={action.isPending} onClick={() => void save()}>
              Save command
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={diagnostic} onOpenChange={setDiagnostic}>
        <DialogContent>
          <DialogTitle>Why can’t this command run?</DialogTitle>
          <DialogDescription>
            Check a custom command against a real member, channel, role restrictions, and Discord
            permissions. This diagnostic does not execute it.
          </DialogDescription>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              action.mutate(
                {
                  action: "diagnose",
                  name: diagnosticName,
                  channelId,
                  userId: userId || undefined,
                },
                {
                  onSuccess: (result) =>
                    setDiagnosticResult(result as { allowed: boolean; explanation: string }),
                },
              );
            }}
          >
            <label>
              Custom command name
              <input
                value={diagnosticName}
                onChange={(e) => setDiagnosticName(e.target.value)}
                required
              />
            </label>
            <label>
              Channel
              <select value={channelId} onChange={(e) => setChannelId(e.target.value)} required>
                <option value="">Choose a text channel</option>
                {resources.data?.channels
                  .filter((c) => c.type === 0 || c.type === 5)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Member ID (optional)
              <input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="Leave blank to check your account"
                pattern="\d{17,20}"
              />
            </label>
            {diagnosticResult && (
              <Notice tone={diagnosticResult.allowed ? "success" : "warning"}>
                {diagnosticResult.explanation}
              </Notice>
            )}
            {action.error && <Notice tone="error">{action.error.message}</Notice>}
            <div className="form-actions">
              <Button type="submit" disabled={action.isPending}>
                Check access
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleteName}
        onOpenChange={(v) => {
          if (!v) setDeleteName("");
        }}
      >
        <DialogContent>
          <DialogTitle>Delete {deleteName}?</DialogTitle>
          <DialogDescription>
            The custom command and its aliases will be removed. Export the definition first if you
            need a backup.
          </DialogDescription>
          {action.error && <Notice tone="error">{action.error.message}</Notice>}
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setDeleteName("")}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={action.isPending}
              onClick={() =>
                action.mutate(
                  { action: "delete", name: deleteName },
                  {
                    onSuccess: () => {
                      setDeleteName("");
                      notify("Command removed");
                    },
                  },
                )
              }
            >
              Delete command
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
