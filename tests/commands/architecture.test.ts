import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { test } from "vitest";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("../..", import.meta.url)));
const commandsRoot = join(root, "src", "commands");

const expectedCommands = [
  "admin/logging.ts",
  "admin/settings.ts",
  "admin/setup.ts",
  "admin/welcome.ts",
  "general/help.ts",
  "general/info.ts",
  "general/ping.ts",
  "general/server.ts",
  "general/status.ts",
  "moderation/ban.ts",
  "moderation/case.ts",
  "moderation/history.ts",
  "moderation/kick.ts",
  "moderation/note.ts",
  "moderation/purge.ts",
  "moderation/report.ts",
  "moderation/timeout.ts",
  "moderation/unban.ts",
  "moderation/warn.ts",
  "moderation/warnings.ts",
] as const;

test("all command files live in category folders", () => {
  for (const file of expectedCommands) {
    const path = relative(commandsRoot, join(commandsRoot, file));
    assert.equal(path.split(sep).length, 2, `${file} should be category/name.ts`);
  }
});

test("command folders contain only command modules", async () => {
  for (const file of expectedCommands) {
    const source = await readFile(join(commandsRoot, file), "utf8");
    assert.doesNotMatch(
      source,
      /from "\.\/utils\.js"/,
      `${file} should import shared helpers from services, not command folders`,
    );
  }
});

test("dedicated tests cover every command source file", async () => {
  const commandFiles = await listCommandFiles(commandsRoot);
  assert.deepEqual(commandFiles, [...expectedCommands].sort());

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
