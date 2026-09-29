import assert from "node:assert/strict";
import { test } from "vitest";
import { assertChatInputCommand, assertUsesService, readCommandSource } from "../helpers/sourceAssertions.js";

test("XP command registers rank and leaderboard with guild context", async () => {
  const command = await readCommandSource("general", "xp");
  assertChatInputCommand(command, { className: "XpCommand", name: "xp", description: "View XP, levels, and the leaderboard" });
  assertUsesService(command, "xpService");
  assert.match(command.source, /InteractionContextType.Guild/);
  assert.match(command.source, /setName\("rank"\)/);
  assert.match(command.source, /setName\("leaderboard"\)/);
});
