import { z } from "zod";
import { DashboardError } from "./contracts.js";

export const nodeKinds = [
  "trigger",
  "argument",
  "variable",
  "permission",
  "branch",
  "cooldown",
  "response",
  "embed",
  "components",
  "action",
  "ticket",
  "delay",
  "reuse",
  "error",
  "plugin",
] as const;
const scalar = z.union([z.string().max(2000), z.number().finite(), z.boolean()]);
const identifier = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/);
export const workflowNodeSchema = z
  .object({
    id: identifier,
    kind: z.enum(nodeKinds),
    label: z.string().min(1).max(80),
    position: z.object({ x: z.number().finite(), y: z.number().finite() }),
    config: z
      .record(z.string().max(48), z.union([scalar, z.array(scalar).max(25)]))
      .refine((c) => Object.keys(c).length <= 20),
  })
  .strict();
export const workflowSchema = z
  .object({
    version: z.literal(1),
    name: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/),
    description: z.string().max(300),
    nodes: z.array(workflowNodeSchema).min(1).max(50),
    edges: z
      .array(
        z
          .object({
            id: identifier,
            source: identifier,
            target: identifier,
            port: z.enum(["next", "yes", "no", "error"]),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type Workflow = z.infer<typeof workflowSchema>;
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export interface NodeIssue {
  nodeId: string;
  message: string;
}
export function validateWorkflow(
  input: unknown,
  pluginActions: readonly string[] = [],
): { definition?: Workflow; issues: NodeIssue[] } {
  const parsed = workflowSchema.safeParse(input);
  if (!parsed.success)
    return {
      issues: parsed.error.issues.map((i) => ({
        nodeId: String(i.path[1] ?? "workflow"),
        message: `${i.path.join(".")}: ${i.message}`,
      })),
    };
  const w = parsed.data,
    issues: NodeIssue[] = [];
  const add = (nodeId: string, message: string) => issues.push({ nodeId, message });
  const ids = new Set(w.nodes.map((n) => n.id));
  if (ids.size !== w.nodes.length) add("workflow", "Node IDs must be unique");
  if (new Set(w.edges.map((e) => e.id)).size !== w.edges.length)
    add("workflow", "Edge IDs must be unique");
  const triggers = w.nodes.filter((n) => n.kind === "trigger");
  if (triggers.length !== 1) add("workflow", "Use exactly one trigger");
  const used = new Set<string>();
  for (const e of w.edges) {
    if (!ids.has(e.source) || !ids.has(e.target))
      add(e.source, "Connection references a missing node");
    if (used.has(`${e.source}:${e.port}`))
      add(e.source, "Only one connection is allowed per output");
    used.add(`${e.source}:${e.port}`);
    const source = w.nodes.find((n) => n.id === e.source);
    if (
      (e.port === "yes" || e.port === "no") &&
      source?.kind !== "branch" &&
      source?.kind !== "permission"
    )
      add(e.source, "Only checks support yes/no paths");
    if (source && ["branch", "permission"].includes(source.kind) && e.port === "next")
      add(e.source, "Checks must use yes/no paths");
    if (w.nodes.find((n) => n.id === e.target)?.kind === "trigger")
      add(e.target, "Triggers cannot have incoming connections");
  }
  const visited = new Set<string>(),
    active = new Set<string>();
  function visit(id: string) {
    if (active.has(id)) {
      add(id, "Cycles are not allowed");
      return;
    }
    if (visited.has(id)) return;
    active.add(id);
    visited.add(id);
    for (const e of w.edges.filter((e) => e.source === id)) visit(e.target);
    active.delete(id);
  }
  if (triggers[0]) visit(triggers[0].id);
  for (const n of w.nodes) {
    const c = n.config;
    if (!visited.has(n.id) && !w.nodes.some((v) => v.kind === "reuse" && v.config.nodeId === n.id))
      add(n.id, "Connect this node to the trigger");
    if (n.kind === "trigger" && !["command", "memberJoin"].includes(String(c.event)))
      add(n.id, "Choose command or memberJoin");
    if (
      n.kind === "trigger" &&
      c.event === "memberJoin" &&
      !/^\d{17,20}$/.test(String(c.channelId))
    )
      add(n.id, "Choose an output channel for member-join events");
    if (
      n.kind === "embed" &&
      c.color !== undefined &&
      (!Number.isInteger(c.color) || Number(c.color) < 0 || Number(c.color) > 0xffffff)
    )
      add(n.id, "Embed color must be an integer from 0 through 16777215");
    if (
      ["response", "embed", "error", "components"].includes(n.kind) &&
      !String(c.text ?? "").trim()
    )
      add(n.id, "A response is required");
    if (["argument", "variable"].includes(n.kind) && !identifier.safeParse(c.name).success)
      add(n.id, "Enter a safe variable name");
    if (
      n.kind === "argument" &&
      (!Number.isInteger(c.index) || Number(c.index) < 0 || Number(c.index) > 24)
    )
      add(n.id, "Argument index must be 0–24");
    if (n.kind === "delay" && (!Number.isInteger(c.ms) || Number(c.ms) < 0 || Number(c.ms) > 5000))
      add(n.id, "Delay must be 0–5000ms");
    if (
      n.kind === "cooldown" &&
      (!Number.isInteger(c.seconds) || Number(c.seconds) < 1 || Number(c.seconds) > 86400)
    )
      add(n.id, "Cooldown must be 1–86400 seconds");
    if (
      n.kind === "permission" &&
      ![
        "ManageGuild",
        "ModerateMembers",
        "BanMembers",
        "KickMembers",
        "ManageRoles",
        "ManageChannels",
      ].includes(String(c.permission))
    )
      add(n.id, "Choose a supported Discord permission");
    if (
      n.kind === "branch" &&
      (!String(c.variable ?? "") || !["equals", "contains", "greater"].includes(String(c.operator)))
    )
      add(n.id, "Choose a variable and comparison");
    if (
      n.kind === "action" &&
      ![
        "addrole",
        "removerole",
        "warn",
        "note",
        "kick",
        "ban",
        "unban",
        "timeout",
        "removetimeout",
      ].includes(String(c.action))
    )
      add(n.id, "Unsupported bot action");
    if (n.kind === "action" && (!String(c.userId ?? "") || !String(c.reason ?? "").trim()))
      add(n.id, "A target and reason are required");
    if (
      n.kind === "action" &&
      ["addrole", "removerole"].includes(String(c.action)) &&
      !/^\d{17,20}$/.test(String(c.roleId))
    )
      add(n.id, "Select a Discord role ID");
    if (
      n.kind === "action" &&
      c.action === "timeout" &&
      (!Number.isInteger(c.durationMs) ||
        Number(c.durationMs) < 60000 ||
        Number(c.durationMs) > 2419200000)
    )
      add(n.id, "Timeout must be 1 minute through 28 days");
    if (n.kind === "ticket" && !["close", "reopen"].includes(String(c.action)))
      add(n.id, "Choose close or reopen for the current ticket");
    if (
      n.kind === "reuse" &&
      !w.nodes.some(
        (v) => v.id === c.nodeId && ["response", "embed", "action", "plugin"].includes(v.kind),
      )
    )
      add(n.id, "Choose a reusable response, embed, action or plugin node");
    if (n.kind === "plugin" && !pluginActions.includes(String(c.action)))
      add(n.id, "This plugin action is unavailable");
    if (n.kind === "components") {
      if (c.url && !z.url({ protocol: /^https$/ }).safeParse(c.url).success)
        add(n.id, "Button URL must use HTTPS");
      if (!c.url && !Array.isArray(c.options)) add(n.id, "Provide a link URL or select options");
      if (
        !c.url &&
        Array.isArray(c.options) &&
        (!c.options.length ||
          c.options.some(
            (option) => typeof option !== "string" || !option.trim() || option.length > 100,
          ))
      )
        add(n.id, "Use 1–25 non-empty select labels of at most 100 characters");
    }
  }
  return { definition: w, issues };
}
export function checkedWorkflow(input: unknown, actions?: readonly string[]) {
  const checked = validateWorkflow(input, actions);
  if (checked.issues.length || !checked.definition)
    throw new DashboardError(
      400,
      checked.issues.map((i) => `${i.nodeId}: ${i.message}`).join("; "),
    );
  return checked.definition;
}
export interface WorkflowPorts {
  authorize(): Promise<void>;
  permission(name: string): Promise<boolean>;
  action(
    node: WorkflowNode,
    variables: ReadonlyMap<string, string | number | boolean>,
  ): Promise<string>;
  cooldown(nodeId: string, seconds: number): Promise<boolean>;
}
export interface TraceStep {
  nodeId: string;
  label: string;
  status: "succeeded" | "simulated" | "failed";
  result: string;
  elapsedMs: number;
}
export function interpolate(text: unknown, values: ReadonlyMap<string, string | number | boolean>) {
  return String(text ?? "")
    .replace(/\{([a-zA-Z][\w.-]{0,47})\}/g, (_, key: string) =>
      String(values.get(key) ?? `{${key}}`),
    )
    .slice(0, 2000);
}
export async function executeWorkflow(
  w: Workflow,
  ports: WorkflowPorts,
  options: {
    test: boolean;
    args: string[];
    actorId: string;
    signal?: AbortSignal;
    pluginActions?: readonly string[];
  },
) {
  checkedWorkflow(w, options.pluginActions);
  const trace: TraceStep[] = [],
    values = new Map<string, string | number | boolean>([["user.id", options.actorId]]);
  const deadline = Date.now() + 15_000;
  let current = w.nodes.find((n) => n.kind === "trigger"),
    steps = 0;
  while (current) {
    if (++steps > 50 || Date.now() > deadline || options.signal?.aborted)
      throw new DashboardError(408, "Workflow cancelled or execution limit reached");
    await ports.authorize();
    const n = current,
      c = n.config,
      start = Date.now();
    let port = "next",
      result = "Ready",
      simulated = false;
    try {
      if (n.kind === "argument") {
        const raw = options.args[Number(c.index)] ?? c.default ?? "";
        const value =
          c.type === "number"
            ? Number(raw)
            : c.type === "boolean"
              ? String(raw) === "true"
              : String(raw);
        if (typeof value === "number" && !Number.isFinite(value))
          throw new DashboardError(400, "Argument must be a number");
        values.set(String(c.name), value);
        result = `${c.name} assigned`;
      } else if (n.kind === "variable") {
        values.set(String(c.name), interpolate(c.value, values));
        result = `${c.name} assigned`;
      } else if (n.kind === "permission") {
        port = (await ports.permission(String(c.permission))) ? "yes" : "no";
        result = port === "yes" ? "Permission granted" : "Permission denied";
      } else if (n.kind === "branch") {
        const value = String(values.get(String(c.variable)) ?? ""),
          compare = interpolate(c.value, values);
        port = (
          c.operator === "equals"
            ? value === compare
            : c.operator === "contains"
              ? value.includes(compare)
              : Number(value) > Number(compare)
        )
          ? "yes"
          : "no";
        result = `Branch: ${port}`;
      } else if (n.kind === "cooldown") {
        if (!options.test && !(await ports.cooldown(n.id, Number(c.seconds))))
          throw new DashboardError(429, "Workflow cooldown is active");
        result = options.test ? "Cooldown checked in test mode" : "Cooldown reserved";
      } else if (n.kind === "delay") {
        if (!options.test)
          await new Promise<void>((resolve, reject) => {
            const onAbort = () => {
              clearTimeout(timer);
              reject(new DashboardError(408, "Cancelled"));
            };
            const timer = setTimeout(() => {
              options.signal?.removeEventListener("abort", onAbort);
              resolve();
            }, Number(c.ms));
            options.signal?.addEventListener("abort", onAbort, { once: true });
          });
        result = `Delay ${c.ms}ms`;
      } else if (n.kind !== "trigger") {
        const actionNode = n.kind === "reuse" ? w.nodes.find((v) => v.id === c.nodeId)! : n;
        if (options.test) {
          simulated = true;
          result = ["response", "embed", "error", "components"].includes(actionNode.kind)
            ? interpolate(actionNode.config.text, values)
            : `Would execute ${actionNode.kind}: ${actionNode.config.action ?? actionNode.label}`;
        } else result = await ports.action(actionNode, values);
      }
      trace.push({
        nodeId: n.id,
        label: n.label,
        status: simulated ? "simulated" : "succeeded",
        result,
        elapsedMs: Date.now() - start,
      });
    } catch (error) {
      result = error instanceof Error ? error.message.slice(0, 300) : "Action failed";
      trace.push({
        nodeId: n.id,
        label: n.label,
        status: "failed",
        result,
        elapsedMs: Date.now() - start,
      });
      if (!w.edges.some((e) => e.source === n.id && e.port === "error"))
        return { status: "failed" as const, trace };
      values.set("error", result);
      port = "error";
    }
    current = w.nodes.find(
      (v) => v.id === w.edges.find((e) => e.source === n.id && e.port === port)?.target,
    );
  }
  return { status: options.test ? ("simulated" as const) : ("succeeded" as const), trace };
}
