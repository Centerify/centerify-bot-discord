import assert from "node:assert/strict";
import { test } from "vitest";
import {
  assertChatInputCommand,
  assertGuildCommand,
  assertOption,
  assertUsesService,
  readCommandSource,
} from "../helpers/sourceAssertions.js";

test("kick command registers and records member kicks", async () => {
  const command = await readCommandSource("moderation", "kick");

  assertChatInputCommand(command, { className: "KickCommand", name: "kick", description: "Kick a member" });
  assertGuildCommand(command, "KickMembers");
  assertOption(command, "User", "user", true);
  assertOption(command, "String", "reason", true);
  assert.match(command.source, /member\.kick/);
  assertUsesService(command, "moderationCaseService");
});
