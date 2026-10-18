import { expect, test, vi } from "vitest";
import { CustomCommandCache } from "../../../src/modules/custom-commands/application/CustomCommandCache.js";
test("coalesces guild-local reads, expires, evicts and handles failures", async () => {
  let now = 0;
  const cache = new CustomCommandCache<number>(100, 2, () => now);
  const load = vi.fn().mockResolvedValue(1);
  expect(
    await Promise.all([cache.get("a", load), cache.get("a", load)]),
  ).toEqual([1, 1]);
  expect(load).toHaveBeenCalledOnce();
  await cache.get("b", load);
  await cache.get("c", load);
  expect(cache.size).toBe(2);
  await cache.get("a", load);
  expect(load).toHaveBeenCalledTimes(4);
  now = 100;
  await cache.get("a", load);
  expect(load).toHaveBeenCalledTimes(5);
  cache.invalidate("a");
  await cache.get("a", load);
  expect(load).toHaveBeenCalledTimes(6);
  cache.clear();
  expect(cache.size).toBe(0);
  const failed = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(2);
  await expect(cache.get("a", failed)).rejects.toThrow("offline");
  expect(await cache.get("a", failed)).toBe(2);
});
test("invalidating an in-flight read cannot restore stale data", async () => {
  const cache = new CustomCommandCache<string>();
  let complete!: (value: string) => void;
  const old = cache.get(
    "a",
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  await Promise.resolve();
  cache.invalidate("a");
  expect(await cache.get("a", async () => "fresh")).toBe("fresh");
  complete("stale");
  await old;
  expect(await cache.get("a", async () => "unused")).toBe("fresh");
});

test("expiry cleanup preserves live entries across invalidation and reinsertion", async () => {
  let now = 0;
  const cache = new CustomCommandCache<string>(100, 3, () => now);
  const load = vi.fn(async () => "value");
  await cache.get("a", load);
  now = 10;
  await cache.get("b", load);
  cache.invalidate("a");
  now = 20;
  await cache.get("a", load);
  now = 110;
  await cache.get("c", load);
  expect(cache.size).toBe(2);
  await cache.get("a", load);
  expect(load).toHaveBeenCalledTimes(4);
  now = 120;
  await cache.get("a", load);
  expect(load).toHaveBeenCalledTimes(5);
  expect(cache.size).toBe(2);
});
