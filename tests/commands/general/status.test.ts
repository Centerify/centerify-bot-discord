import { test } from "vitest";
import {
  assertChatInputCommand,
  assertOption,
  readCommandSource,
} from "../helpers/sourceAssertions.js";

test("status command registers an optional user profile lookup", async () => {
  const command = await readCommandSource("general", "status");

  assertChatInputCommand(command, {
    className: "StatusCommand",
    name: "status",
    description: "View a member's server profile",
  });
  assertOption(command, "User", "user", false);
});
