import { existsSync } from "node:fs";
import { cp, mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, vi } from "vitest";
import { LocalPluginRegistry } from "../../../src/modules/plugins/infrastructure/LocalPluginRegistry.js";
import { FilePluginStorage } from "../../../src/modules/plugins/infrastructure/FilePluginStorage.js";
import { loadInstalledPlugins } from "../../../src/bootstrap/plugins.js";
import { createApplication } from "../../../src/bootstrap/application.js";
import { discordModuleToken } from "../../../src/adapters/discord/modules.js";
import { silentLogger } from "../../../src/core/index.js";
import { packageHash } from "../../../src/modules/plugins/infrastructure/files.js";
vi.mock("../../../src/adapters/prisma/client.js", () => ({ db: {} }));
const root = fileURLToPath(new URL("../../..", import.meta.url));
const binary = join(root, "artifacts/plugin-installer/windows-amd64/centerify-plugins.exe");
test.skipIf(
  process.platform !== "win32" ||
    !existsSync(binary) ||
    !existsSync(join(root, "plugins/better-ticket/package/index.js")),
)(
  "native installer and the bot loader agree on the real Better Ticket package",
  async () => {
    const sourceHash = await packageHash(join(root, "plugins/better-ticket/package"));
    const folder = await mkdtemp(join(tmpdir(), "centerify-native-integration-"));
    const run = (...args: string[]) => {
      const result = spawnSync(binary, ["--root", folder, ...args], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 10000,
      });
      expect(result.status, result.stderr).toBe(0);
      return result;
    };
    try {
      await cp(
        join(root, "plugins/better-ticket/package"),
        join(folder, "plugins/better-ticket/package"),
        { recursive: true },
      );
      await mkdir(join(folder, "marketplace"));
      await cp(join(root, "marketplace/catalog.json"), join(folder, "marketplace/catalog.json"));
      const manager = new LocalPluginRegistry(folder);
      expect(await loadInstalledPlugins(manager)).toEqual([]);
      run("install", "--path", join(folder, "plugins/better-ticket/package/plugin.json"));
      const loaded = await loadInstalledPlugins(manager);
      expect(loaded.map((module) => module.metadata.id)).toEqual(["better-ticket"]);
      const app = createApplication({
        logger: silentLogger,
        pluginManager: manager,
        additionalModules: loaded,
      });
      await app.start();
      try {
        expect(
          app
            .extensions(discordModuleToken)
            .flatMap(({ value }) => Object.keys(value.definition.commands ?? {})),
        ).toContain("bticket");
      } finally {
        await app.stop();
      }
      run("verify", "better-ticket");
      const storage = new FilePluginStorage(manager.stateRoot, "better-ticket");
      await storage.update("123456789012345678", () => ({
        value: { preserved: true },
        result: null,
      }));
      run("disable", "better-ticket");
      expect(await loadInstalledPlugins(manager)).toEqual([]);
      run("enable", "better-ticket");
      run("uninstall", "better-ticket", "--confirm");
      expect(await loadInstalledPlugins(manager)).toEqual([]);
      expect(await storage.read("123456789012345678")).toEqual({ preserved: true });
      run("install", "better-ticket");
      const entry = (await manager.installed()).plugins["better-ticket"]!;
      const path = join(manager.packagePath("better-ticket", entry.manifest.version), "index.js");
      await writeFile(path, (await readFile(path, "utf8")) + "\n// tampered\n");
      await expect(loadInstalledPlugins(manager)).rejects.toThrow("integrity");
      expect(await packageHash(join(root, "plugins/better-ticket/package"))).toBe(sourceHash);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
  30000,
);
