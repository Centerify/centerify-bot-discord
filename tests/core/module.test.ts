import { expect, test, vi } from "vitest";
import { ModuleRegistry, serviceToken, type CenterifyModule } from "../../src/core/index.js";

test("starts dependencies first and stops in reverse order", async () => {
  const calls: string[] = [];
  const registry = new ModuleRegistry();
  const makeModule = (id: string, dependsOn: string[] = []): CenterifyModule => ({
    metadata: { id, name: id, version: "1", dependsOn },
    register: () => { calls.push(`register:${id}`); },
    start: () => { calls.push(`start:${id}`); },
    stop: () => { calls.push(`stop:${id}`); },
  });
  registry.register(makeModule("feature", ["foundation"]), { config: { custom: true } });
  registry.register(makeModule("foundation"));
  await registry.start();
  await registry.stop();
  expect(calls).toEqual([
    "register:foundation", "register:feature", "start:foundation", "start:feature",
    "stop:feature", "stop:foundation",
  ]);
});

test.each([
  ["missing", /Missing module dependency: missing/],
  ["disabled", /Disabled module dependency: disabled/],
  ["cycle", /Circular module dependency/],
] as const)("rejects %s dependencies before registering services", async (problem, message) => {
  const registry = new ModuleRegistry();
  const register = vi.fn();
  registry.register({
    metadata: { id: "feature", name: "Feature", version: "1", dependsOn: [problem === "cycle" ? "cycle" : problem] },
    register,
  });
  if (problem === "disabled") registry.register({ metadata: { id: "disabled", name: "Disabled", version: "1" }, register }, { enabled: false });
  if (problem === "cycle") registry.register({ metadata: { id: "cycle", name: "Cycle", version: "1", dependsOn: ["feature"] }, register });
  await expect(registry.start()).rejects.toThrow(message);
  expect(register).not.toHaveBeenCalled();
});

test("isolates module configuration and rolls back earlier modules after startup failure", async () => {
  const registry = new ModuleRegistry();
  const token = serviceToken<number>("service");
  const stop = vi.fn();
  const failedStop = vi.fn();
  registry.register({ metadata: { id: "first", name: "First", version: "1" }, register(context) {
    expect(context.config).toEqual({ value: 42 });
    context.provide(token, 42);
  }, stop }, { config: { value: 42 } });
  registry.register({ metadata: { id: "second", name: "Second", version: "1" }, register() { throw new Error("failed"); }, stop: failedStop });
  await expect(registry.start()).rejects.toThrow("failed");
  expect(stop).toHaveBeenCalledOnce();
  expect(failedStop).toHaveBeenCalledOnce();
  expect(() => registry.resolve(token)).toThrow("Service is not registered");
});

test("disabled modules never register, and cleanup continues after a disposer fails", async () => {
  const registry = new ModuleRegistry();
  const disabled = vi.fn();
  const cleanup: string[] = [];
  const extension = serviceToken<string>("extension");
  registry.register({ metadata: { id: "disabled", name: "Disabled", version: "1" }, register: disabled }, { enabled: false });
  registry.register({ metadata: { id: "enabled", name: "Enabled", version: "1" }, register(context) {
    context.contribute(extension, "one");
    context.onStop(() => { cleanup.push("first"); });
    context.onStop(() => { cleanup.push("second"); throw new Error("cleanup failure"); });
  } });
  await registry.start();
  expect(disabled).not.toHaveBeenCalled();
  expect(registry.extensions(extension)).toEqual([{ moduleId: "enabled", value: "one" }]);
  await expect(registry.stop()).rejects.toThrow("Module shutdown failed");
  expect(cleanup).toEqual(["second", "first"]);
  expect(registry.extensions(extension)).toEqual([]);
  await expect(registry.stop()).resolves.toBeUndefined();
});
