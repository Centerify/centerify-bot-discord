import { test } from "vitest";
import {
  assertChatInputCommand,
  assertGuildCommand,
  assertOption,
  assertUsesService,
  readCommandSource,
} from "../helpers/sourceAssertions.js";

test("warnings command registers recent warning lookup", async () => {
  const command = await readCommandSource("moderation", "warnings");

  assertChatInputCommand(command, {
    className: "WarningsCommand",
    name: "warnings",
    description: "Show recent warnings for a member",
  });
  assertGuildCommand(command, "ModerateMembers");
  assertOption(command, "User", "user", true);
  assertUsesService(command, "recentWarningsForUser");
});
