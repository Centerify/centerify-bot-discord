import { expect, test, vi } from "vitest";
import { startHealthServer } from "../../src/bootstrap/health.js";

test("readiness reflects connection loss and recovery without exposing diagnostics", async () => {
  let ready = true;
  const health = await startHealthServer(0, async () => {
    if (!ready) throw new Error("synthetic-private-database-url");
    return true;
  });
  const url = `http://127.0.0.1:${health.port}`;
  try {
    expect((await fetch(`${url}/healthz`)).status).toBe(200);
    ready = false;
    const failed = await fetch(`${url}/healthz`);
    expect(failed.status).toBe(503);
    expect(await failed.text()).toBe('{"status":"unavailable"}');
    ready = true;
    expect((await fetch(`${url}/healthz`)).status).toBe(200);
    expect((await fetch(`${url}/other`)).status).toBe(404);
    expect((await fetch(`${url}/healthz`, { method: "POST" })).status).toBe(404);
  } finally {
    await health.close();
  }
});

test("hung dependency checks time out and share a single pending operation", async () => {
  let finish: (value: boolean) => void = () => {};
  const check = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
  const health = await startHealthServer(0, check, 25);
  const url = `http://127.0.0.1:${health.port}/healthz`;
  try {
    const results = await Promise.all([fetch(url), fetch(url)]);
    expect(results.map((response) => response.status)).toEqual([503, 503]);
    expect(check).toHaveBeenCalledTimes(1);
    finish(false);
    await new Promise<void>((resolve) => setImmediate(resolve));
    check.mockResolvedValue(true);
    expect((await fetch(url)).status).toBe(200);
  } finally {
    finish(false);
    await health.close();
  }
});
