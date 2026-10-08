import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { test } from "vitest";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("../..", import.meta.url)));
const modulesRoot = join(root, "src", "modules");

const expectedCommands = [
  "admin/custom.ts",
  "admin/settings.ts",
  "admin/setup.ts",
  "admin/unverify.ts",
  "admin/verify.ts",
  "general/help.ts",
  "general/info.ts",
  "general/ping.ts",
  "general/server.ts",
  "general/status.ts",
  "general/xp.ts",
  "moderation/ban.ts",
  "moderation/case.ts",
  "moderation/history.ts",
  "moderation/kick.ts",
  "moderation/note.ts",
  "moderation/purge.ts",
  "moderation/report.ts",
  "moderation/timeout.ts",
  "moderation/unban.ts",
  "moderation/unwarn.ts",
  "moderation/warn.ts",
  "moderation/warnings.ts",
] as const;

test("all Discord commands belong to module adapters", async () => {
  for (const file of await moduleCommandFiles()) {
    assert.match(file, /^[a-z-]+\/discord\/commands\/[^/]+\.ts$/);
    const source = await readFile(join(modulesRoot, file), "utf8");
    assert.doesNotMatch(source, /(?:prisma|infrastructure)\//, `${file} must use its module API for persistence`);
  }
});

test("dedicated tests cover every module command", async () => {
  const commandFiles = (await moduleCommandFiles()).map((file) => basename(file)).sort();
  assert.deepEqual(commandFiles, expectedCommands.map((file) => basename(file)).sort());

  for (const file of expectedCommands) {
    const testFile = join(
      root,
      "tests",
      "commands",
      file.replace(/\.ts$/, ".test.ts"),
    );
    await assert.doesNotReject(() => readFile(testFile, "utf8"), `${file} needs a dedicated test`);
  }
});

async function listCommandFiles(dir: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        return listCommandFiles(path, relativePath);
      }

      return entry.isFile() && entry.name.endsWith(".ts") ? [relativePath] : [];
    }),
  );

  return files.flat().sort();
}

async function moduleCommandFiles() {
  return (await listCommandFiles(modulesRoot)).filter((file) => file.includes("/discord/commands/"));
}
