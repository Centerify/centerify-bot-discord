import { test } from "vitest";
import {
  assertChatInputCommand,
  assertGuildCommand,
  assertOption,
  assertUsesService,
  readCommandSource,
} from "../helpers/sourceAssertions.js";

test("history command registers recent moderation history lookup", async () => {
  const command = await readCommandSource("moderation", "history");

  assertChatInputCommand(command, {
    className: "HistoryCommand",
    name: "history",
    description: "Show recent moderation history for a user",
  });
  assertGuildCommand(command, "ModerateMembers");
  assertOption(command, "User", "user", true);
  assertUsesService(command, "recentForUser");
  assertUsesService(command, "countForUser");
  assertUsesService(command, "countWarningsForUser");
  assertUsesService(command, "formatDetailedCaseField");
});
