import assert from "node:assert/strict";
import { test } from "vitest";
import { assertChatInputCommand, readCommandSource } from "../helpers/sourceAssertions.js";

test("help command registers the command directory view", async () => {
  const command = await readCommandSource("general", "help");

  assertChatInputCommand(command, {
    className: "HelpCommand",
    name: "help",
    description: "See all available bot commands",
  });
  assert.match(command.source, /ContainerBuilder/);
  assert.match(command.source, /getRegisteredChatInputCommands/);
});
