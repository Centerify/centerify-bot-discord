import { test } from "vitest";
import {
  assertChatInputCommand,
  assertGuildCommand,
  assertOption,
  assertUsesService,
  readCommandSource,
} from "../helpers/sourceAssertions.js";

test("case command registers case lookup by number", async () => {
  const command = await readCommandSource("moderation", "case");

  assertChatInputCommand(command, {
    className: "CaseCommand",
    name: "case",
    description: "Show a moderation case",
  });
  assertGuildCommand(command, "ModerateMembers");
  assertOption(command, "Integer", "case-number", true);
  assertUsesService(command, "findByCaseNumber");
});
