import assert from "node:assert/strict";
import { test } from "vitest";
import {
  assertChatInputCommand,
  assertGuildCommand,
  assertOption,
  readCommandSource,
} from "../helpers/sourceAssertions.js";

test("purge command registers bulk message deletion", async () => {
  const command = await readCommandSource("moderation", "purge");

  assertChatInputCommand(command, {
    className: "PurgeCommand",
    name: "purge",
    description: "Bulk delete recent messages",
  });
  assertGuildCommand(command, "ManageMessages");
  assertOption(command, "Integer", "amount", true);
  assert.match(command.source, /\.setMinValue\(1\)/);
  assert.match(command.source, /\.setMaxValue\(100\)/);
  assert.match(command.source, /bulkDelete/);
});
