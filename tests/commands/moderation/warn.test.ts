import assert from "node:assert/strict";
import { test } from "vitest";
import { getWarnRoleName } from "../../../src/services/moderation/warningRoles.js";
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
  assert.doesNotMatch(command.source, /\.setName\("role"\)/);
  assert.match(command.source, /countWarningsForUser/);
  assert.match(command.source, /getOrCreateWarnRole/);
  assert.match(command.source, /scheduleWarningRoleRemoval/);
  assertUsesService(command, "dmUser");
  assertUsesService(command, "moderationCaseService");
  assert.equal(getWarnRoleName(1), "warn1");
  assert.equal(getWarnRoleName(12), "warn12");
});
