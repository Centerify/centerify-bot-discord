import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DefaultRestOptions } from "discord.js";
import { silentLogger } from "../../src/core/index.js";
const mocks = vi.hoisted(() => ({ request: vi.fn(), dump: vi.fn(), destroy: vi.fn(), pools: [] as object[] }));
vi.mock("undici", () => ({ Pool: class {
  constructor() { mocks.pools.push(this); }
  request = mocks.request;
  destroy = mocks.destroy;
} }));
import { createInteractionTransport } from "../../src/adapters/discord/interactionTransport.js";
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.pools.length = 0;
  mocks.request.mockResolvedValue({ statusCode: 200, body: { dump: mocks.dump } });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
test("callbacks use the dedicated dispatcher while uploads and other requests retain the SDK transport", async () => {
  const request = vi.spyOn(DefaultRestOptions, "makeRequest").mockResolvedValue({} as never);
  const transport = createInteractionTransport(silentLogger);
  const callback = "https://discord.com/api/v10/interactions/id/token/callback";
  const options = { method: "POST", body: "{}", signal: new AbortController().signal };
  await transport.makeRequest(callback, options);
  expect(request).toHaveBeenLastCalledWith(callback, { ...options, dispatcher: mocks.pools[0] });
  for (const url of ["https://discord.com/api/v10/channels/id/messages", "https://discord.com/api/v10/webhooks/id/token", "https://example.com/api/v10/interactions/id/token/callback"])
    await transport.makeRequest(url, options);
  expect(request.mock.calls.slice(1).every(([, init]) => init === options)).toBe(true);
  await transport.stop();
});
test("both connections are warmed before startup, refreshed, and closed on shutdown", async () => {
  const transport = createInteractionTransport(silentLogger);
  await transport.start();
  expect(mocks.request).toHaveBeenCalledTimes(2);
  expect(mocks.dump).toHaveBeenCalledTimes(2);
  expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ method: "GET", path: "/api/v10/gateway" }));
  expect(mocks.request.mock.calls[0][0].headers).toBeUndefined();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(mocks.request).toHaveBeenCalledTimes(4);
  await transport.stop();
  expect(mocks.destroy).toHaveBeenCalledOnce();
  expect(mocks.request.mock.calls[0][0].signal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(mocks.request).toHaveBeenCalledTimes(4);
});
test("warm-up failures are contained and retry on the next interval", async () => {
  const warn = vi.fn();
  mocks.request.mockRejectedValueOnce(new Error("Offline"));
  const transport = createInteractionTransport({ ...silentLogger, warn });
  await transport.start();
  expect(warn).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(mocks.request).toHaveBeenCalledTimes(4);
  await transport.stop();
});
