import assert from "node:assert/strict";
import { test } from "vitest";
import {
  assertChatInputCommand,
  assertGuildCommand,
  assertOption,
  assertUsesService,
  readCommandSource,
} from "../helpers/sourceAssertions.js";

test("ban command registers and records bans", async () => {
  const command = await readCommandSource("moderation", "ban");

  assertChatInputCommand(command, { className: "BanCommand", name: "ban", description: "Ban a user" });
  assertGuildCommand(command, "BanMembers");
  assertOption(command, "User", "user", true);
  assertOption(command, "String", "reason", true);
  assertOption(command, "Integer", "delete-days", false);
  assertOption(command, "Boolean", "global", false);
  assert.match(command.source, /deleteMessageSeconds/);
  assertUsesService(command, "getGlobalModerationTargets");
  assertUsesService(command, "moderationCaseService");
});
