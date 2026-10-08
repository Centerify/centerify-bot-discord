import assert from "node:assert/strict";
import { test } from "vitest";
import { readFile } from "node:fs/promises";
import { getWarnRoleName } from "../../../src/modules/moderation/discord/warningRoleNames.js";
import {
  assertChatInputCommand,
  assertGuildCommand,
  assertOption,
  assertUsesService,
  readCommandSource,
} from "../helpers/sourceAssertions.js";

test("warn command registers warnings with optional durations and automatic roles", async () => {
  const command = await readCommandSource("moderation", "warn");

  assertChatInputCommand(command, {
    className: "WarnCommand",
    name: "warn",
    description: "Create a warning for a member",
  });
  assertGuildCommand(command, "ModerateMembers");
  assertOption(command, "User", "user", true);
  assertOption(command, "String", "reason", true);
  assertOption(command, "String", "duration", false);
  assertOption(command, "Boolean", "global", false);
  assert.doesNotMatch(command.source, /\.setName\("role"\)/);
  assert.match(command.source, /return runWarn\(interaction, warnMember\)/);
  assertUsesService(command, "warnMember");
  const adapter = await readFile("src/modules/moderation/discord/warn.ts", "utf8");
  assert.match(adapter, /warnMember\.execute/);
  assert.match(adapter, /getOrCreateWarnRole/);
  assert.match(adapter, /scheduleWarningRoleRemoval/);
  assert.match(adapter, /dmUser/);
  assert.match(adapter, /getGlobalModerationTargets/);
  assert.equal(getWarnRoleName(1), "warn1");
  assert.equal(getWarnRoleName(12), "warn12");
});
