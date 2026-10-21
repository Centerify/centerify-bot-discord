import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { FilePluginStorage } from "../../../src/modules/plugins/infrastructure/FilePluginStorage.js";
import { LocalPluginRegistry } from "../../../src/modules/plugins/infrastructure/LocalPluginRegistry.js";

test("plugin storage serializes concurrent writes and isolates servers", async () => {
  const root = await mkdtemp(join(tmpdir(), "centerify-storage-"));
  try {
    const store = new FilePluginStorage(root, "example");
    await Promise.all(
      Array.from({ length: 8 }, () =>
        store.update("123456789012345678", (raw) => ({
          value: Number(raw ?? 0) + 1,
          result: null,
        })),
      ),
    );
    expect(await store.read("123456789012345678")).toBe(8);
    expect(await store.read("223456789012345678")).toBeNull();
    await expect(store.read("../escape")).rejects.toThrow("Invalid server ID");
    expect(() => new FilePluginStorage(root, "../escape")).toThrow();
    expect((await new LocalPluginRegistry(root).installed()).plugins).toEqual({});
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
