import assert from "node:assert/strict";
import { test } from "vitest";
import {
  assertChatInputCommand,
  assertGuildCommand,
  assertOption,
  assertUsesService,
  readCommandSource,
} from "../helpers/sourceAssertions.js";

test("welcome command registers guild welcome controls", async () => {
  const command = await readCommandSource("admin", "welcome");

  assertChatInputCommand(command, {
    className: "WelcomeCommand",
    name: "welcome",
    description: "Manage welcome messages",
  });
  assertGuildCommand(command, "ManageGuild");
  assertOption(command, "Channel", "channel", true);
  assertOption(command, "String", "message", true);
  assert.match(command.source, /\.setName\("status"\)/);
  assert.match(command.source, /\.setName\("enable"\)/);
  assert.match(command.source, /\.setName\("disable"\)/);
  assert.match(command.source, /\.setName\("test"\)/);
  assertUsesService(command, "guildConfigService");
});
