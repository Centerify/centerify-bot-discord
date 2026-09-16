import assert from "node:assert/strict";
import { test } from "vitest";
import {
  assertChatInputCommand,
  assertGuildCommand,
  assertOption,
  assertUsesService,
  readCommandSource,
} from "../helpers/sourceAssertions.js";

test("report command registers member reports for moderation review", async () => {
  const command = await readCommandSource("moderation", "report");

  assertChatInputCommand(command, {
    className: "ReportCommand",
    name: "report",
    description: "Report a user to the moderation team",
  });
  assertGuildCommand(command);
  assertOption(command, "User", "user", true);
  assertOption(command, "String", "reason", true);
  assertUsesService(command, "reportService");
  assert.match(command.source, /createMessageComponentCollector/);
});
