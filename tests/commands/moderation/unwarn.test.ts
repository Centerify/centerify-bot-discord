import assert from "node:assert/strict";
import { test } from "vitest";
import {
  assertChatInputCommand,
  assertGuildCommand,
  assertOption,
  assertUsesService,
  readCommandSource,
} from "../helpers/sourceAssertions.js";

test("unwarn command revokes the newest active warning and notifies the member", async () => {
  const command = await readCommandSource("moderation", "unwarn");

  assertChatInputCommand(command, {
    className: "UnwarnCommand",
    name: "unwarn",
    description: "Remove an active warning from a member",
  });
  assertGuildCommand(command, "ModerateMembers");
  assertOption(command, "User", "user", true);
  assertOption(command, "String", "reason", true);
  assertOption(command, "Integer", "case-number", false);
  assertUsesService(command, "revokeActiveWarning");
  assertUsesService(command, "removeWarningRoleIfUnused");
  assertUsesService(command, "dmUser");
  assert.match(command.source, /Active warnings remaining/);
});
