"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  applyNodeChanges,
  type Node,
  type NodeProps,
  type Connection,
  type NodeChange,
} from "@xyflow/react";
import {
  ListFilter,
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  Download,
  GitBranch,
  Grip,
  History,
  Layers,
  List,
  LoaderCircle,
  MessageSquare,
  MousePointer2,
  Play,
  Plus,
  Redo2,
  Save,
  Search,
  Shield,
  Sparkles,
  Square,
  Ticket,
  Trash2,
  Undo2,
  Upload,
  Variable,
  Zap,
} from "lucide-react";
import {
  checkedWorkflow,
  workflowSchema,
  validateWorkflow,
  type Workflow,
  type WorkflowNode,
} from "../../src/dashboard/workflows";
import { request, useResource } from "@/lib/client";
import type { Resources, SavedWorkflow, Trace, Plugins } from "@/lib/types";
import { download, relative } from "@/lib/utils";
import { useWorkspace } from "./shell";
import { Badge, Empty, Failure, Heading, Loading, Notice } from "./shared";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
const library = [
  {
    kind: "trigger",
    label: "Command / event",
    category: "Start here",
    icon: Zap,
    config: { event: "command" },
  },
  {
    kind: "argument",
    label: "Read an argument",
    category: "Data",
    icon: ListFilter,
    config: { name: "argument", index: 0, type: "string", default: "" },
  },
  {
    kind: "variable",
    label: "Set a variable",
    category: "Data",
    icon: Variable,
    config: { name: "greeting", value: "Hello" },
  },
  {
    kind: "permission",
    label: "Permission check",
    category: "Logic",
    icon: Shield,
    config: { permission: "ManageGuild" },
  },
  {
    kind: "branch",
    label: "Condition / branch",
    category: "Logic",
    icon: GitBranch,
    config: { variable: "greeting", operator: "equals", value: "Hello" },
  },
  { kind: "cooldown", label: "Cooldown", category: "Logic", icon: Clock, config: { seconds: 30 } },
  {
    kind: "response",
    label: "Send a response",
    category: "Respond",
    icon: MessageSquare,
    config: { text: "Hey there! Glad you’re here." },
  },
  {
    kind: "embed",
    label: "Rich embed",
    category: "Respond",
    icon: Layers,
    config: { title: "A little hello", text: "Welcome to our community.", color: 10980346 },
  },
  {
    kind: "components",
    label: "Button / select",
    category: "Respond",
    icon: MousePointer2,
    config: {
      text: "Find your way around.",
      label: "Read our guidelines",
      url: "https://discord.com",
    },
  },
  {
    kind: "action",
    label: "Bot action",
    category: "Actions",
    icon: Shield,
    config: { action: "note", userId: "{user.id}", reason: "Workflow note" },
  },
  {
    kind: "ticket",
    label: "Ticket operation",
    category: "Actions",
    icon: Ticket,
    config: { action: "close" },
  },
  { kind: "delay", label: "Wait a moment", category: "Control", icon: Clock, config: { ms: 1000 } },
  {
    kind: "reuse",
    label: "Reusable step",
    category: "Control",
    icon: Copy,
    config: { nodeId: "response" },
  },
  {
    kind: "error",
    label: "Handle an error",
    category: "Control",
    icon: Code2,
    config: { text: "Something needs a second look: {error}" },
  },
  {
    kind: "plugin",
    label: "Community greeting",
    category: "Extensions",
    icon: Sparkles,
    config: { action: "community-kit:greeting", text: "Welcome to the community!" },
  },
] as const;
function starter(name = "hello"): Workflow {
  return {
    version: 1,
    name,
    description: "A useful little workflow for your community.",
    nodes: [
      {
        id: "trigger",
        kind: "trigger",
        label: "Command invoked",
        position: { x: 60, y: 100 },
        config: { event: "command" },
      },
      {
        id: "response",
        kind: "response",
        label: "A friendly response",
        position: { x: 360, y: 100 },
        config: { text: "Hey there! Glad you’re here. ✨" },
      },
    ],
    edges: [{ id: "e1", source: "trigger", target: "response", port: "next" }],
  };
}
type FlowNode = Node<{ node: WorkflowNode }, "workflow">;
function WorkflowCard({ data, selected }: NodeProps<FlowNode>) {
  const n = data.node,
    Icon = library.find((l) => l.kind === n.kind)?.icon ?? Zap;
  return (
    <div className={`flow-node ${selected ? "selected" : ""}`}>
      <Handle type="target" position={Position.Left} isConnectable={n.kind !== "trigger"} />
      <div className="node-kind">
        <Icon size={12} />
        {n.kind}
      </div>
      <strong>{n.label}</strong>
      <p>
        {String(
          n.config.text ??
            n.config.action ??
            n.config.event ??
            n.config.name ??
            n.config.permission ??
            "Configure this step",
        )}
      </p>
      {["branch", "permission"].includes(n.kind) ? (
        <>
          <Handle type="source" position={Position.Right} id="yes" style={{ top: "35%" }} />
          <Handle
            type="source"
            position={Position.Right}
            id="no"
            style={{ top: "70%", background: "var(--orange)" }}
          />
        </>
      ) : (
        <Handle type="source" position={Position.Right} id="next" />
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        id="error"
        style={{ background: "var(--red)" }}
      />
    </div>
  );
}
const nodeTypes = { workflow: WorkflowCard };
export function BuilderPage() {
  const { guild } = useWorkspace(),
    query = useResource<SavedWorkflow[]>(guild.id, "workflows"),
    [editing, setEditing] = useState<{
      definition: Workflow;
      revision: number;
      saved?: SavedWorkflow;
    } | null>(null),
    [newOpen, setNewOpen] = useState(false),
    [name, setName] = useState(""),
    [newError, setNewError] = useState("");
  if (editing)
    return (
      <WorkflowEditor
        key={`${editing.definition.name}:${editing.saved?.id ?? 0}`}
        initial={editing.definition}
        initialRevision={editing.revision}
        saved={editing.saved}
        onBack={() => {
          setEditing(null);
          void query.refetch();
        }}
      />
    );
  return (
    <>
      <Heading
        eyebrow="YOUR IDEAS. A LITTLE MORE AUTOMATIC."
        title="Good ideas deserve a workflow."
        description="Connect a few useful steps and let Centerify take care of the rest."
      >
        <label className="button button-secondary">
          <Upload size={14} />
          Import workflow
          <input
            className="sr-only"
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 500000) {
                setNewError("Import must be smaller than 500KB");
                setNewOpen(true);
                return;
              }
              try {
                const checked = checkedWorkflow(JSON.parse(await file.text()));
                setEditing({ definition: checked, revision: 0 });
              } catch (error) {
                setNewError(error instanceof Error ? error.message : "Invalid workflow file");
                setNewOpen(true);
              }
              e.target.value = "";
            }}
          />
        </label>
        <Button
          onClick={() => {
            setName("");
            setNewError("");
            setNewOpen(true);
          }}
        >
          <Plus size={15} />
          Create workflow
        </Button>
      </Heading>
      {query.isPending ? (
        <Loading label="Finding your workflows" />
      ) : query.error ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : query.data.length ? (
        <div className="workflow-list">
          {query.data.map((w) => (
            <div key={w.id} className="panel workflow-row">
              <div className="toolbar-group">
                <span className="plugin-logo">
                  <GitBranch size={20} />
                </span>
                <div>
                  <h3>{w.name}</h3>
                  <p>{w.draft.description || "Your community workflow"}</p>
                  <small>
                    Revision {w.revision} · Updated {relative(w.updatedAt)}
                  </small>
                </div>
              </div>
              <div className="workflow-row-actions">
                <Badge tone={w.enabled ? "success" : "neutral"}>
                  {w.enabled ? "Published" : "Draft"}
                </Badge>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setEditing({ definition: w.draft as Workflow, revision: w.revision, saved: w })
                  }
                >
                  Open builder <ArrowUpRight size={13} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title="Start with a small, good idea"
            description="A welcome, a helpful reminder, or a little time saved for your team. Your first workflow starts here."
          >
            <Button onClick={() => setEditing({ definition: starter(), revision: 0 })}>
              <Plus size={14} />
              Build your first workflow
            </Button>
          </Empty>
        </section>
      )}
      <div className="cards-grid section-spacer">
        {[
          {
            icon: MousePointer2,
            title: "Connect the dots",
            description:
              "Drag nodes, connect execution paths, and tune each step. A keyboard-friendly outline offers the same controls.",
          },
          {
            icon: Play,
            title: "Try it with confidence",
            description:
              "Test the path and preview responses. Test mode simulates actions without sending messages or moderating members.",
          },
          {
            icon: Shield,
            title: "Thoughtful guardrails",
            description:
              "Runtime permissions, cooldowns, execution limits, and version history keep powerful ideas accountable.",
          },
        ].map((card) => (
          <section className="panel plugin-card" key={card.title}>
            <card.icon size={23} style={{ color: "var(--accent)" }} />
            <h3>{card.title}</h3>
            <p>{card.description}</p>
          </section>
        ))}
      </div>
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogTitle>A name for your next idea</DialogTitle>
          <DialogDescription>
            Use a short command name. Published command workflows run through{" "}
            <code>/flow name</code> in Discord.
          </DialogDescription>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!/^[a-z][a-z0-9_-]{0,31}$/.test(name)) {
                setNewError(
                  "Use 1–32 lowercase letters, numbers, hyphens or underscores, starting with a letter.",
                );
                return;
              }
              if (query.data?.some((w) => w.name === name)) {
                setNewError("A workflow already uses this name");
                return;
              }
              setNewOpen(false);
              setEditing({ definition: starter(name), revision: 0 });
            }}
          >
            <label>
              Workflow name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="weekly-welcome"
                autoFocus
                required
              />
            </label>
            {newError && <Notice tone="error">{newError}</Notice>}
            <div className="form-actions">
              <Button type="submit">
                Open builder <ChevronRight size={14} />
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
function WorkflowEditor({
  initial,
  initialRevision,
  saved,
  onBack,
}: {
  initial: Workflow;
  initialRevision: number;
  saved?: SavedWorkflow;
  onBack: () => void;
}) {
  const { guild, me, notify } = useWorkspace(),
    resources = useResource<Resources>(guild.id, "resources"),
    plugins = useResource<Plugins>(guild.id, "plugins"),
    [w, setW] = useState<Workflow>(structuredClone(initial)),
    [revision, setRevision] = useState(initialRevision),
    [selected, setSelected] = useState<string | null>(initial.nodes[0]?.id ?? null),
    [view, setView] = useState("canvas"),
    [librarySearch, setLibrarySearch] = useState(""),
    [past, setPast] = useState<Workflow[]>([]),
    [future, setFuture] = useState<Workflow[]>([]),
    [saveStatus, setSaveStatus] = useState("Saved"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [testOpen, setTestOpen] = useState(false),
    [channelId, setChannelId] = useState(""),
    [args, setArgs] = useState(""),
    [trace, setTrace] = useState<Trace | null>(null),
    [testBusy, setTestBusy] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false),
    [history, setHistory] = useState(saved?.history ?? []),
    [enabled, setEnabled] = useState(saved?.enabled ?? false),
    [publishConfirm, setPublishConfirm] = useState(false);
  const [recoverable, setRecoverable] = useState<Workflow | null>(null);
  const current = w.nodes.find((n) => n.id === selected),
    lastSaved = useRef(JSON.stringify(initial)),
    revisionRef = useRef(initialRevision),
    saveInFlight = useRef(false),
    failedSnapshot = useRef(""),
    runId = useRef(crypto.randomUUID()),
    autoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    draftKey = `centerify-draft:${guild.id}:${initial.name}`;
  useEffect(() => {
    try {
      const local = JSON.parse(localStorage.getItem(draftKey) ?? "null");
      if (
        local?.revision === initialRevision &&
        JSON.stringify(local.definition) !== JSON.stringify(initial)
      ) {
        const parsed = workflowSchema.safeParse(local.definition);
        if (parsed.success) setRecoverable(parsed.data);
      }
    } catch {
      /* A damaged recovery copy cannot replace the server draft. */
    }
  }, [draftKey, initialRevision, initial]);
  const pluginActions =
    plugins.data?.extensions.flatMap((e) => e.nodes.map((n) => `${e.id}:${n.id}`)) ?? [];
  const issues = validateWorkflow(w, pluginActions).issues;
  const commit = useCallback(
    (next: Workflow) => {
      setPast((old) => [...old.slice(-39), structuredClone(w)]);
      setFuture([]);
      setW(next);
      setSaveStatus("Unsaved changes");
    },
    [w],
  );
  function patchNode(patch: Partial<WorkflowNode>) {
    if (!current) return;
    commit({ ...w, nodes: w.nodes.map((n) => (n.id === current.id ? { ...n, ...patch } : n)) });
  }
  async function persist(
    action: "save" | "publish" | "disable" | "rollback" = "save",
    version?: number,
  ) {
    if (saveInFlight.current) {
      if (action !== "save") notify("Wait for the current save to finish", "error");
      return;
    }
    saveInFlight.current = true;
    setBusy(true);
    setSaveStatus("Saving…");
    setError("");
    const snapshot = structuredClone(w);
    try {
      const result = await request<SavedWorkflow>(`guilds/${guild.id}/workflows`, {
        action,
        name: w.name,
        definition: snapshot,
        revision: revisionRef.current,
        version,
      });
      revisionRef.current = result.revision;
      setRevision(result.revision);
      setHistory(result.history);
      setEnabled(result.enabled);
      lastSaved.current = JSON.stringify(result.draft);
      localStorage.setItem(
        draftKey,
        JSON.stringify({ definition: result.draft, revision: result.revision }),
      );
      setSaveStatus("Saved");
      failedSnapshot.current = "";
      if (action === "rollback") setW(result.draft as Workflow);
      if (action !== "save")
        notify(me.user.demo ? `Workflow ${action} simulated` : `Workflow ${action} completed`);
    } catch (error) {
      failedSnapshot.current = JSON.stringify(snapshot);
      setSaveStatus("Save needs attention");
      setError(error instanceof Error ? error.message : "Workflow could not be saved");
    } finally {
      saveInFlight.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      busy ||
      JSON.stringify(w) === lastSaved.current ||
      JSON.stringify(w) === failedSnapshot.current
    )
      return;
    localStorage.setItem(
      draftKey,
      JSON.stringify({ definition: w, revision: revisionRef.current }),
    );
    setSaveStatus("Unsaved changes");
    autoTimer.current = setTimeout(() => void persist(), 1800);
    return () => clearTimeout(autoTimer.current);
  }, [w, busy, draftKey]);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(w) !== lastSaved.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [w]);
  const nodes: FlowNode[] = w.nodes.map((n) => ({
    id: n.id,
    type: "workflow",
    position: n.position,
    data: { node: n },
    selected: n.id === selected,
  }));
  const edges = w.edges.map((e) => ({
    ...e,
    sourceHandle: e.port,
    label: e.port === "next" ? undefined : e.port,
    style: e.port === "error" ? { stroke: "var(--red)" } : undefined,
  }));
  function onNodesChange(changes: NodeChange<FlowNode>[]) {
    const changed = applyNodeChanges(changes, nodes);
    const selection = changes.find((c) => c.type === "select" && c.selected);
    if (selection && selection.type === "select") setSelected(selection.id);
    if (changes.some((c) => c.type === "position" || c.type === "remove")) {
      const nextIds = new Set(changed.map((n) => n.id));
      setW((old) => ({
        ...old,
        nodes: changed.map((n) => ({ ...n.data.node, position: n.position })),
        edges: old.edges.filter((e) => nextIds.has(e.source) && nextIds.has(e.target)),
      }));
    }
  }
  function connect(c: Connection) {
    if (!c.source || !c.target) return;
    const port = (c.sourceHandle ?? "next") as Workflow["edges"][number]["port"],
      edge = {
        id: `e${crypto.randomUUID().slice(0, 8)}`,
        source: c.source,
        target: c.target,
        port,
      };
    const next = {
      ...w,
      edges: w.edges.filter((e) => e.source !== c.source || e.port !== port).concat(edge),
    };
    if (
      validateWorkflow(next).issues.some(
        (i) => i.message.includes("Cycles") || i.message.includes("incoming"),
      )
    ) {
      notify("This connection creates a cycle or connects into a trigger", "error");
      return;
    }
    commit(next);
  }
  function add(kind: string) {
    const item = library.find((n) => n.kind === kind)!;
    if (kind === "trigger" && w.nodes.some((n) => n.kind === "trigger")) {
      notify("A workflow has exactly one trigger", "error");
      return;
    }
    const id = `n${crypto.randomUUID().slice(0, 8)}`;
    commit({
      ...w,
      nodes: [
        ...w.nodes,
        {
          id,
          kind: item.kind,
          label: item.label,
          position: { x: 80 + w.nodes.length * 80, y: 220 + (w.nodes.length % 3) * 90 },
          config:
            item.kind === "plugin"
              ? { action: pluginActions[0] ?? "", text: "Welcome to the community!" }
              : { ...item.config },
        },
      ],
    });
    setSelected(id);
  }
  async function test() {
    runId.current = crypto.randomUUID();
    setTestBusy(true);
    setError("");
    try {
      const result = await request<Trace>(`guilds/${guild.id}/workflows`, {
        action: "test",
        name: w.name,
        revision: revisionRef.current,
        definition: w,
        channelId,
        args: args.split(/\s+/).filter(Boolean),
        runId: runId.current,
      });
      setTrace(result);
      setTestOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Test could not finish");
    } finally {
      setTestBusy(false);
    }
  }
  const previews = w.nodes.filter((n) =>
    ["response", "embed", "components", "error"].includes(n.kind),
  );
  const numericFields = new Set(["index", "seconds", "ms", "durationMs", "color"]);
  const configKeys: Record<string, string[]> = {
    trigger: ["event", "channelId"],
    argument: ["name", "index", "type", "default"],
    variable: ["name", "value"],
    permission: ["permission"],
    branch: ["variable", "operator", "value"],
    cooldown: ["seconds"],
    response: ["text"],
    embed: ["title", "text", "color"],
    components: ["text", "label", "url", "options"],
    action: ["action", "userId", "reason", "roleId", "durationMs"],
    ticket: ["action"],
    delay: ["ms"],
    reuse: ["nodeId"],
    error: ["text"],
    plugin: ["action", "text"],
  };
  const configOptions = (key: string): string[] | undefined => {
    if (!current) return;
    if (key === "event") return ["command", "memberJoin"];
    if (key === "type") return ["string", "number", "boolean"];
    if (key === "operator") return ["equals", "contains", "greater"];
    if (key === "permission")
      return [
        "ManageGuild",
        "ModerateMembers",
        "BanMembers",
        "KickMembers",
        "ManageRoles",
        "ManageChannels",
      ];
    if (key === "action" && current.kind === "action")
      return [
        "note",
        "warn",
        "kick",
        "ban",
        "unban",
        "timeout",
        "removetimeout",
        "addrole",
        "removerole",
      ];
    if (key === "action" && current.kind === "ticket") return ["close", "reopen"];
    if (key === "action" && current.kind === "plugin") return pluginActions;
    if (key === "nodeId")
      return w.nodes
        .filter((n) => ["response", "embed", "action", "plugin"].includes(n.kind))
        .map((n) => n.id);
  };
  return (
    <>
      <Heading
        eyebrow="A LITTLE AUTOMATION. A LOT OF POSSIBILITY."
        title={w.name}
        description="Connect your idea, test the path, and publish when it feels right."
      >
        <Button
          variant="secondary"
          onClick={() => {
            clearTimeout(autoTimer.current);
            onBack();
          }}
        >
          <ArrowLeft size={14} />
          All workflows
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void persist()}>
          <Save size={14} />
          Save draft
        </Button>
        <Button disabled={busy || issues.length > 0} onClick={() => setPublishConfirm(true)}>
          <Zap size={14} />
          Publish
        </Button>
      </Heading>
      <div className="builder-toolbar">
        <div className="builder-toolbar-group">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Undo"
            disabled={!past.length}
            onClick={() => {
              const prev = past.at(-1)!;
              setFuture((old) => [w, ...old]);
              setPast((old) => old.slice(0, -1));
              setW(prev);
            }}
          >
            <Undo2 size={16} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Redo"
            disabled={!future.length}
            onClick={() => {
              setPast((old) => [...old, w]);
              setW(future[0]!);
              setFuture((old) => old.slice(1));
            }}
          >
            <Redo2 size={16} />
          </Button>
          <span className="inline-note">
            {busy ? (
              <LoaderCircle size={12} className="spin" style={{ display: "inline" }} />
            ) : (
              <Check size={12} style={{ display: "inline", color: "var(--green)" }} />
            )}{" "}
            {saveStatus} · r{revision}
          </span>
          <Badge tone={enabled ? "success" : "neutral"}>{enabled ? "Published" : "Draft"}</Badge>
        </div>
        <div className="builder-toolbar-group">
          <Button
            size="sm"
            variant={view === "canvas" ? "secondary" : "ghost"}
            onClick={() => setView("canvas")}
          >
            <GitBranch size={13} />
            Canvas
          </Button>
          <Button
            size="sm"
            variant={view === "outline" ? "secondary" : "ghost"}
            onClick={() => setView("outline")}
          >
            <List size={13} />
            Outline
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Export workflow"
            onClick={() => download(`${w.name}.centerify.json`, JSON.stringify(w, null, 2))}
          >
            <Download size={15} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Version history"
            onClick={() => setHistoryOpen(true)}
          >
            <History size={15} />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={issues.length > 0 || testBusy}
            onClick={() => setTestOpen(true)}
          >
            <Play size={13} />
            Test workflow
          </Button>
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {recoverable && (
        <Notice tone="warning">
          A browser recovery draft has unsaved changes from this revision.{" "}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              commit(recoverable);
              setRecoverable(null);
            }}
          >
            Restore local changes
          </Button>{" "}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              localStorage.removeItem(draftKey);
              setRecoverable(null);
            }}
          >
            Discard recovery copy
          </Button>
        </Notice>
      )}
      <div className="builder-layout">
        <aside className="node-library" aria-label="Node library">
          <h3>A few useful building blocks</h3>
          <p>Add a node, then connect its output to the next step.</p>
          <div className="search-input">
            <Search size={12} />
            <input
              placeholder="Find a node…"
              aria-label="Search node library"
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
            />
          </div>
          {library
            .filter(
              (l) =>
                (l.kind !== "plugin" || pluginActions.length > 0) &&
                l.label.toLowerCase().includes(librarySearch.toLowerCase()),
            )
            .map((item, index, items) => (
              <div key={item.kind} style={{ display: "contents" }}>
                {(index === 0 || items[index - 1]?.category !== item.category) && (
                  <div className="library-category">{item.category}</div>
                )}
                <button
                  draggable
                  className="library-node"
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/centerify-node", item.kind);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => add(item.kind)}
                >
                  <item.icon size={13} />
                  {item.label}
                </button>
              </div>
            ))}
        </aside>
        <div
          className="builder-canvas"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const kind = e.dataTransfer.getData("application/centerify-node");
            if (library.some((n) => n.kind === kind)) add(kind);
          }}
        >
          {view === "canvas" ? (
            <ReactFlow<FlowNode>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onConnect={connect}
              onNodeClick={(_, n) => setSelected(n.id)}
              onNodeDragStart={() => {
                setPast((old) => [...old.slice(-39), structuredClone(w)]);
                setFuture([]);
              }}
              onEdgesDelete={(deleted) =>
                commit({ ...w, edges: w.edges.filter((e) => !deleted.some((d) => d.id === e.id)) })
              }
              fitView
              minZoom={0.25}
              maxZoom={1.7}
              colorMode="dark"
              proOptions={{ hideAttribution: false }}
              deleteKeyCode={["Backspace", "Delete"]}
            >
              <Background gap={22} color="var(--border)" size={1} />
              <Controls showInteractive />
              <MiniMap nodeColor={() => "#74628e"} maskColor="#101014aa" pannable zoomable />
            </ReactFlow>
          ) : (
            <div className="builder-outline" aria-label="Accessible workflow outline">
              {w.nodes.map((n) => (
                <section className="outline-node" key={n.id}>
                  <button onClick={() => setSelected(n.id)}>
                    {n.label} <Badge>{n.kind}</Badge>
                  </button>
                  {(["branch", "permission"].includes(n.kind)
                    ? ["yes", "no", "error"]
                    : ["next", "error"]
                  ).map((port) => (
                    <label key={port}>
                      {port} path
                      <select
                        value={
                          w.edges.find((e) => e.source === n.id && e.port === port)?.target ?? ""
                        }
                        onChange={(e) => {
                          if (!e.target.value)
                            commit({
                              ...w,
                              edges: w.edges.filter(
                                (edge) => !(edge.source === n.id && edge.port === port),
                              ),
                            });
                          else
                            connect({
                              source: n.id,
                              sourceHandle: port,
                              target: e.target.value,
                              targetHandle: null,
                            });
                        }}
                      >
                        <option value="">End this path</option>
                        {w.nodes
                          .filter((other) => other.id !== n.id && other.kind !== "trigger")
                          .map((other) => (
                            <option key={other.id} value={other.id}>
                              {other.label} ({other.id})
                            </option>
                          ))}
                      </select>
                    </label>
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
        <aside className="builder-config" aria-label="Selected node configuration">
          {current ? (
            <>
              <h3>{current.label}</h3>
              <label>
                Step label
                <input
                  value={current.label}
                  onChange={(e) => patchNode({ label: e.target.value })}
                />
              </label>
              {(configKeys[current.kind] ?? []).map((key) => {
                const options = configOptions(key),
                  value = current.config[key] ?? "";
                return (
                  <label key={key}>
                    {key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
                    {options ? (
                      <select
                        value={String(value)}
                        onChange={(e) =>
                          patchNode({ config: { ...current.config, [key]: e.target.value } })
                        }
                      >
                        <option value="">Choose…</option>
                        {options.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : key === "channelId" ? (
                      <select
                        value={String(value)}
                        onChange={(e) =>
                          patchNode({ config: { ...current.config, channelId: e.target.value } })
                        }
                      >
                        <option value="">Choose event output channel</option>
                        {resources.data?.channels
                          .filter((c) => c.type === 0 || c.type === 5)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              #{c.name}
                            </option>
                          ))}
                      </select>
                    ) : key === "text" ? (
                      <textarea
                        value={String(value)}
                        onChange={(e) =>
                          patchNode({ config: { ...current.config, text: e.target.value } })
                        }
                        rows={4}
                      />
                    ) : (
                      <input
                        type={numericFields.has(key) ? "number" : "text"}
                        value={Array.isArray(value) ? value.join(", ") : String(value)}
                        onChange={(e) =>
                          patchNode({
                            config: {
                              ...current.config,
                              [key]:
                                key === "options"
                                  ? e.target.value
                                      .split(",")
                                      .map((v) => v.trim())
                                      .filter(Boolean)
                                  : numericFields.has(key)
                                    ? Number(e.target.value)
                                    : e.target.value,
                            },
                          })
                        }
                      />
                    )}
                  </label>
                );
              })}
              <small className="inline-note">
                Use {"{user.id}"} or {"{variableName}"} in text values. Arguments are zero indexed.
              </small>
              {issues
                .filter((i) => i.nodeId === current.id)
                .map((issue, i) => (
                  <p className="field-error" key={i}>
                    {issue.message}
                  </p>
                ))}
              <div className="toolbar-group section-spacer">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={current.kind === "trigger"}
                  onClick={() => {
                    const id = `n${crypto.randomUUID().slice(0, 8)}`;
                    commit({
                      ...w,
                      nodes: [
                        ...w.nodes,
                        {
                          ...structuredClone(current),
                          id,
                          label: `${current.label} copy`,
                          position: { x: current.position.x + 40, y: current.position.y + 100 },
                        },
                      ],
                    });
                    setSelected(id);
                  }}
                >
                  <Copy size={12} />
                  Duplicate
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete selected node"
                  onClick={() => {
                    commit({
                      ...w,
                      nodes: w.nodes.filter((n) => n.id !== current.id),
                      edges: w.edges.filter(
                        (e) => e.source !== current.id && e.target !== current.id,
                      ),
                    });
                    setSelected(null);
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </>
          ) : (
            <Empty title="Pick a step" description="Select a node to shape what happens next." />
          )}
        </aside>
      </div>
      <div className="toolbar section-spacer">
        <span className="inline-note">
          <Grip size={12} style={{ display: "inline", marginRight: 5 }} />
          Drag to move · Connect from right to left · Select and use arrow keys · Bottom output
          handles errors
        </span>
        <Badge tone={issues.length ? "warning" : "success"}>
          {issues.length ? `${issues.length} things to check` : "Ready to test"}
        </Badge>
      </div>
      {issues.length > 0 && (
        <details className="notice">
          <summary>Workflow validation</summary>
          <ul>
            {issues.map((i, index) => (
              <li key={index}>
                <button className="text-link" onClick={() => setSelected(i.nodeId)}>
                  {i.nodeId}: {i.message}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="builder-preview">
        <section className="panel">
          <div className="panel-header">
            <h2>A little preview</h2>
            <Badge>Response content</Badge>
          </div>
          <div className="panel-body">
            <div className="discord-preview">
              <span className="preview-avatar">
                <Zap size={18} />
              </span>
              <div style={{ minWidth: 0 }}>
                <strong>
                  Centerify<span className="bot-tag">APP</span>
                </strong>
                <small>Today at 12:00</small>
                {previews.length ? (
                  previews.map((n) => (
                    <div key={n.id} className={n.kind === "embed" ? "preview-embed" : ""}>
                      {n.kind === "embed" && <strong>{String(n.config.title ?? "")}</strong>}
                      <p>{String(n.config.text ?? "").replaceAll("{user.id}", me.user.id)}</p>
                      {n.kind === "components" && (
                        <Badge>{String(n.config.label ?? "Informational select")}</Badge>
                      )}
                    </div>
                  ))
                ) : (
                  <p>Add a response or embed to see it here.</p>
                )}
              </div>
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <h2>The path your idea took</h2>
            {trace && (
              <Badge tone={trace.status === "failed" ? "error" : "success"}>{trace.status}</Badge>
            )}
          </div>
          {trace ? (
            <div className="trace-list">
              {trace.trace.map((step, i) => (
                <div className="trace-item" key={i}>
                  <Check size={13} />
                  <div>
                    <strong>
                      {step.label} <Badge>{step.status}</Badge>
                    </strong>
                    <p>{step.result}</p>
                    <small>
                      {step.elapsedMs} ms · {step.nodeId}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Try a little test run"
              description="See the nodes visited and the outcome of each step. Test mode skips live effects."
            />
          )}
        </section>
      </div>
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogTitle>Try your idea safely</DialogTitle>
          <DialogDescription>
            This test follows the workflow and simulates actions. It will not send messages, change
            roles, moderate members, or change tickets.
          </DialogDescription>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void test();
            }}
          >
            <label>
              Context channel
              <select value={channelId} onChange={(e) => setChannelId(e.target.value)} required>
                <option value="">Choose a channel</option>
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
              Arguments
              <input
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder="Space-separated test arguments"
              />
            </label>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="form-actions">
              {testBusy && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    void request(`guilds/${guild.id}/workflows`, {
                      action: "cancel",
                      name: w.name,
                      revision: revisionRef.current,
                      runId: runId.current,
                    }).catch((error) => notify(error.message, "error"))
                  }
                >
                  <Square size={13} />
                  Cancel run
                </Button>
              )}
              <Button disabled={testBusy} type="submit">
                {testBusy ? <LoaderCircle className="spin" size={14} /> : <Play size={14} />}Run
                safe test
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={publishConfirm} onOpenChange={setPublishConfirm}>
        <DialogContent>
          <DialogTitle>Ready for your community?</DialogTitle>
          <DialogDescription>
            Publishing makes this workflow available to the bot. Command workflows run through{" "}
            <code>/flow name:{w.name}</code>. Event workflows run when their configured event
            occurs.
          </DialogDescription>
          <Notice tone="warning">
            Live effects still require the invoking member’s Discord permissions and the bot’s role
            hierarchy. Member-join workflows require the server owner as publisher and are rechecked
            before execution.
          </Notice>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setPublishConfirm(false)}>
              Keep editing
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                await persist("publish");
                setPublishConfirm(false);
              }}
            >
              Publish {me.user.demo ? "in demo" : "workflow"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogTitle>A little room to go back</DialogTitle>
          <DialogDescription>
            Published versions can be rolled back after validation. Draft saves advance the
            revision; the last 30 published definitions are retained.
          </DialogDescription>
          {history.length ? (
            <div className="form-stack">
              {history
                .slice()
                .reverse()
                .map((h) => (
                  <div className="toolbar" key={h.revision}>
                    <div>
                      <strong>Revision {h.revision}</strong>
                      <p className="inline-note">
                        {relative(h.at)} · {h.actorId}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void persist("rollback", h.revision)}
                    >
                      Restore & publish
                    </Button>
                  </div>
                ))}
            </div>
          ) : (
            <Empty
              title="A fresh beginning"
              description="Your published versions will be kept here."
            />
          )}
          {enabled && (
            <div className="form-actions">
              <Button
                variant="destructive"
                disabled={busy}
                onClick={async () => {
                  await persist("disable");
                  setHistoryOpen(false);
                }}
              >
                Disable workflow
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
