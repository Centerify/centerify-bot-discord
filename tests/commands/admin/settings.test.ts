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
    description: "View or update this server's Centerify configuration",
  });
  assertGuildCommand(command, "ManageGuild");
  assert.doesNotMatch(command.source, /\.add(?:Boolean|String|Integer|Channel|Role)Option\(/);
  assertUsesService(command, "guildConfigService");
  assert.match(command.source, /canManageServer/);
});
