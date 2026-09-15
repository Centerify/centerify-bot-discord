import assert from "node:assert/strict";
import { test } from "vitest";
import {
  assertChatInputCommand,
  assertGuildCommand,
  assertUsesService,
  readCommandSource,
} from "../helpers/sourceAssertions.js";

test("setup command registers the guild setup flow", async () => {
  const command = await readCommandSource("admin", "setup");

  assertChatInputCommand(command, {
    className: "SetupCommand",
    name: "setup",
    description: "Configure Centerify for this server",
  });
  assertGuildCommand(command, "ManageGuild");
  assertUsesService(command, "guildConfigService");
  assert.match(command.source, /SetupInteractionHandler/);
  assert.match(command.source, /SetupRenderer/);
});
