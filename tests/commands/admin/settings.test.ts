import assert from "node:assert/strict";
import { test } from "vitest";
import {
  assertChatInputCommand,
  assertGuildCommand,
  assertUsesService,
  readCommandSource,
} from "../helpers/sourceAssertions.js";

test("settings command registers a guild-only configuration summary", async () => {
  const command = await readCommandSource("admin", "settings");

  assertChatInputCommand(command, {
    className: "SettingsCommand",
    name: "settings",
    description: "Show this server's Centerify configuration",
  });
  assertGuildCommand(command, "ManageGuild");
  assertUsesService(command, "guildConfigService");
  assert.match(command.source, /canManageServer/);
});
