import assert from "node:assert/strict";
import { test } from "vitest";
import { assertChatInputCommand, readCommandSource } from "../helpers/sourceAssertions.js";

test("server command registers server information output", async () => {
  const command = await readCommandSource("general", "server");

  assertChatInputCommand(command, {
    className: "ServerCommand",
    name: "server",
    description: "Show information about this server",
  });
  assert.match(command.source, /guild\.bans\.fetch/);
  assert.match(command.source, /fetchVanityData/);
});
