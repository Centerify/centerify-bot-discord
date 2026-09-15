import assert from "node:assert/strict";
import { test } from "vitest";
import {
  assertChatInputCommand,
  assertGuildCommand,
  assertOption,
  assertUsesService,
  readCommandSource,
} from "../helpers/sourceAssertions.js";

test("unban command registers unban by user id", async () => {
  const command = await readCommandSource("moderation", "unban");

  assertChatInputCommand(command, {
    className: "UnbanCommand",
    name: "unban",
    description: "Unban a user by ID",
  });
  assertGuildCommand(command, "BanMembers");
  assertOption(command, "String", "user-id", true);
  assertOption(command, "String", "reason", true);
  assert.match(command.source, /guild\.bans\.fetch/);
  assert.match(command.source, /members\.unban/);
  assertUsesService(command, "moderationCaseService");
});
