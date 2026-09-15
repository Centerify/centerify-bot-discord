import assert from "node:assert/strict";
import { test } from "vitest";
import {
  assertChatInputCommand,
  assertGuildCommand,
  assertOption,
  assertUsesService,
  readCommandSource,
} from "../helpers/sourceAssertions.js";

test("note command registers private note subcommands", async () => {
  const command = await readCommandSource("moderation", "note");

  assertChatInputCommand(command, {
    className: "NoteCommand",
    name: "note",
    description: "Manage private moderator notes",
  });
  assertGuildCommand(command, "ModerateMembers");
  assertOption(command, "User", "user", true);
  assertOption(command, "String", "note", true);
  assert.match(command.source, /\.setName\("add"\)/);
  assert.match(command.source, /\.setName\("list"\)/);
  assertUsesService(command, "recentNotesForUser");
});
