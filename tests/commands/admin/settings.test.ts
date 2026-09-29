import assert from "node:assert/strict";
import { test } from "vitest";
import {
  assertChatInputCommand,
  assertGuildCommand,
  assertOption,
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
  assertOption(command, "Boolean", "global-ban", false);
  assertOption(command, "Boolean", "global-warn", false);
  assertOption(command, "Boolean", "global-note", false);
  assertOption(command, "Boolean", "welcome-enabled", false);
  assertOption(command, "Channel", "welcome-channel", false);
  assertOption(command, "String", "welcome-message", false);
  assertOption(command, "Boolean", "goodbye-enabled", false);
  assertOption(command, "Channel", "goodbye-channel", false);
  assertOption(command, "String", "goodbye-message", false);
  assertOption(command, "Boolean", "auto-role-enabled", false);
  assertOption(command, "Role", "auto-role", false);
  assertOption(command, "Boolean", "logging-enabled", false);
  assertOption(command, "Channel", "logging-channel", false);
  assertUsesService(command, "guildConfigService");
  assert.match(command.source, /canManageServer/);
  assert.match(command.source, /globalBanEnabled/);
  assert.match(command.source, /globalWarnEnabled/);
  assert.match(command.source, /globalNoteEnabled/);
});
