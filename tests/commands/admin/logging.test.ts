import assert from "node:assert/strict";
import { test } from "vitest";
import {
  assertChatInputCommand,
  assertGuildCommand,
  assertOption,
  assertUsesService,
  readCommandSource,
} from "../helpers/sourceAssertions.js";

test("logging command registers guild logging controls", async () => {
  const command = await readCommandSource("admin", "logging");

  assertChatInputCommand(command, {
    className: "LoggingCommand",
    name: "logging",
    description: "Manage Centerify logging",
  });
  assertGuildCommand(command, "ManageGuild");
  assertOption(command, "Channel", "channel", true);
  assert.match(command.source, /\.setName\("status"\)/);
  assert.match(command.source, /\.setName\("enable"\)/);
  assert.match(command.source, /\.setName\("disable"\)/);
  assertUsesService(command, "guildConfigService");
});
