import assert from "node:assert/strict";
import { test } from "vitest";
import { assertChatInputCommand, readCommandSource } from "../helpers/sourceAssertions.js";

test("info command registers bot information output", async () => {
  const command = await readCommandSource("general", "info");

  assertChatInputCommand(command, {
    className: "InfoCommand",
    name: "info",
    description: "See the bot's info",
  });
  assert.match(command.source, /repositoryInfo/);
});
