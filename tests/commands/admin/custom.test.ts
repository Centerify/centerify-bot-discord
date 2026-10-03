import assert from "node:assert/strict";
import { test } from "vitest";
import {
  assertChatInputCommand,
  assertGuildCommand,
  readCommandSource,
} from "../helpers/sourceAssertions.js";

test("custom rules require administrator access and verified ownership", async () => {
  const command = await readCommandSource("admin", "custom");
  assertChatInputCommand(command, {
    className: "CustomCommand",
    name: "custom",
    description: "Manage custom commands and member events",
  });
  assertGuildCommand(command);
  assert.match(command.source, /setDefaultMemberPermissions\(null\)/);
  assert.match(
    command.source,
    /subcommand !== "run"[\s\S]*?permissions\.has\(PermissionFlagsBits\.Administrator\)/,
  );
  assert.match(command.source, /requireVerifiedOwnership\(interaction\)/);
  for (const action of ["create", "list", "edit", "enable", "delete"]) {
    assert.match(command.source, new RegExp(`setName\\("${action}"\\)`));
  }
});
