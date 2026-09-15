import assert from "node:assert/strict";
import { test } from "vitest";
import {
  assertChatInputCommand,
  assertGuildCommand,
  assertOption,
  assertUsesService,
  readCommandSource,
} from "../helpers/sourceAssertions.js";

test("timeout command registers duration-based member timeouts", async () => {
  const command = await readCommandSource("moderation", "timeout");

  assertChatInputCommand(command, {
    className: "TimeoutCommand",
    name: "timeout",
    description: "Timeout a member",
  });
  assertGuildCommand(command, "ModerateMembers");
  assertOption(command, "User", "user", true);
  assertOption(command, "String", "duration", true);
  assertOption(command, "String", "reason", true);
  assert.match(command.source, /parseDuration/);
  assert.match(command.source, /member\.timeout/);
  assertUsesService(command, "moderationCaseService");
});
