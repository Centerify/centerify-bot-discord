import { expect, test, vi } from "vitest";
import {
  checkedWorkflow,
  executeWorkflow,
  validateWorkflow,
  type Workflow,
  type WorkflowPorts,
} from "../../../src/dashboard/workflows.js";
function definition(): Workflow {
  return {
    version: 1,
    name: "greet",
    description: "Test",
    nodes: [
      {
        id: "start",
        kind: "trigger",
        label: "Start",
        position: { x: 0, y: 0 },
        config: { event: "command" },
      },
      {
        id: "respond",
        kind: "response",
        label: "Respond",
        position: { x: 200, y: 0 },
        config: { text: "Hello {user.id}" },
      },
    ],
    edges: [{ id: "path", source: "start", target: "respond", port: "next" }],
  };
}
function ports(): WorkflowPorts {
  return {
    authorize: vi.fn(async () => {}),
    permission: vi.fn(async () => true),
    cooldown: vi.fn(async () => true),
    action: vi.fn(async () => "Sent"),
  };
}
test("validation rejects missing nodes, unsafe cycles, duplicate ports and arbitrary code nodes", () => {
  const w = definition();
  w.edges.push({ id: "cycle", source: "respond", target: "start", port: "next" });
  expect(validateWorkflow(w).issues.some((i) => /Cycles/.test(i.message))).toBe(true);
  const missing = definition();
  missing.edges[0]!.target = "absent";
  expect(() => checkedWorkflow(missing)).toThrow("missing");
  const duplicate = definition();
  duplicate.edges.push({ ...duplicate.edges[0]!, id: "second" });
  expect(() => checkedWorkflow(duplicate)).toThrow("one connection");
  expect(() =>
    checkedWorkflow({
      ...definition(),
      nodes: [{ ...definition().nodes[0], kind: "javascript", config: { code: "process.exit()" } }],
    }),
  ).toThrow();
});
test("safe test follows nodes and interpolates preview without effects, cooldown reservations or delays", async () => {
  const w = definition(),
    p = ports();
  w.nodes.splice(1, 0, {
    id: "limit",
    kind: "cooldown",
    label: "Cooldown",
    position: { x: 100, y: 0 },
    config: { seconds: 30 },
  });
  w.edges = [
    { id: "e1", source: "start", target: "limit", port: "next" },
    { id: "e2", source: "limit", target: "respond", port: "next" },
  ];
  const result = await executeWorkflow(w, p, {
    test: true,
    args: [],
    actorId: "111111111111111111",
  });
  expect(result.status).toBe("simulated");
  expect(result.trace.at(-1)?.result).toBe("Hello 111111111111111111");
  expect(p.action).not.toHaveBeenCalled();
  expect(p.cooldown).not.toHaveBeenCalled();
  expect(p.authorize).toHaveBeenCalledTimes(3);
});
test("permission denial follows the no branch", async () => {
  const w = definition(),
    p = ports();
  w.nodes.splice(1, 0, {
    id: "check",
    kind: "permission",
    label: "Permission",
    position: { x: 100, y: 0 },
    config: { permission: "ManageGuild" },
  });
  w.edges = [
    { id: "e1", source: "start", target: "check", port: "next" },
    { id: "e2", source: "check", target: "respond", port: "no" },
  ];
  vi.mocked(p.permission).mockResolvedValue(false);
  const result = await executeWorkflow(w, p, { test: true, args: [], actorId: "u" });
  expect(result.trace.map((t) => t.nodeId)).toEqual(["start", "check", "respond"]);
  expect(result.trace[1]?.result).toBe("Permission denied");
});
test("revoked membership stops execution before the next effect", async () => {
  const p = ports();
  vi.mocked(p.authorize)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("Access revoked"));
  await expect(
    executeWorkflow(definition(), p, { test: false, args: [], actorId: "u" }),
  ).rejects.toThrow("Access revoked");
  expect(p.action).not.toHaveBeenCalled();
});
test("action failures use the explicit error path and retain a trace", async () => {
  const w = definition(),
    p = ports();
  w.nodes.push({
    id: "recover",
    kind: "error",
    label: "Recovery",
    position: { x: 400, y: 0 },
    config: { text: "Could not finish" },
  });
  w.edges.push({ id: "err", source: "respond", target: "recover", port: "error" });
  vi.mocked(p.action)
    .mockRejectedValueOnce(new Error("Permission changed"))
    .mockResolvedValueOnce("Reported");
  const result = await executeWorkflow(w, p, { test: false, args: [], actorId: "u" });
  expect(result.trace.map((t) => t.status)).toEqual(["succeeded", "failed", "succeeded"]);
});
test("cancelled runs and unsupported plugin actions fail before effects", async () => {
  const controller = new AbortController();
  controller.abort();
  const p = ports();
  await expect(
    executeWorkflow(definition(), p, {
      test: false,
      args: [],
      actorId: "u",
      signal: controller.signal,
    }),
  ).rejects.toThrow("cancelled");
  const w = definition();
  w.nodes[1] = { ...w.nodes[1]!, kind: "plugin", config: { action: "untrusted:execute" } };
  expect(() => checkedWorkflow(w)).toThrow("unavailable");
  expect(p.action).not.toHaveBeenCalled();
});
