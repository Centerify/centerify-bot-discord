import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { getWarnRoleName } from "../src/commands/moderation/warn.js";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const commandsRoot = join(root, "src", "commands");

const commandFiles = [
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

test("all command source files export a Sapphire command class", async () => {
  for (const file of commandFiles) {
    const source = await readFile(join(commandsRoot, file), "utf8");

    assert.match(
      source,
      /export class \w+Command extends Command/,
      `${file} must export a command class`,
    );
    assert.match(
      source,
      /registerApplicationCommands/,
      `${file} must register application commands`,
    );
  }
});

test("command folders do not contain non-command helper modules", async () => {
  for (const file of commandFiles) {
    const source = await readFile(join(commandsRoot, file), "utf8");
    assert.doesNotMatch(
      source,
      /from "\.\/utils\.js"/,
      `${file} should import shared helpers from services, not command folders`,
    );
  }
});

test("moderation warn command registers duration and automatic warn roles", async () => {
  const source = await readFile(join(commandsRoot, "moderation", "warn.ts"), "utf8");

  assert.match(source, /\.setName\("duration"\)/);
  assert.doesNotMatch(source, /\.setName\("role"\)/);
  assert.match(source, /countWarningsForUser/);
  assert.match(source, /getOrCreateWarnRole/);
  assert.equal(getWarnRoleName(1), "warn1");
  assert.equal(getWarnRoleName(12), "warn12");
});

test("known command files are inside command category folders", () => {
  for (const file of commandFiles) {
    const path = relative(commandsRoot, join(commandsRoot, file));
    assert.equal(path.split(sep).length, 2, `${file} should be category/name.ts`);
  }
});
