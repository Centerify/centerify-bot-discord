import { test } from "vitest";
import { assertChatInputCommand, readCommandSource } from "../helpers/sourceAssertions.js";

test("ping command registers a simple health check", async () => {
  const command = await readCommandSource("general", "ping");

  assertChatInputCommand(command, {
    className: "PingCommand",
    name: "ping",
    description: "Check whether the bot is responsive",
  });
});
