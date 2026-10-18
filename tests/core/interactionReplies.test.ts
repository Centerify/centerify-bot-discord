import { expect, test, vi } from "vitest";
import { MessageFlags } from "discord.js";
import { commandReplyOptions, deferCommandReply, interactionErrorDetails, replyToCommand } from "../../src/adapters/discord/interactions.js";

function fixture() {
  return { deferred: false, replied: false, ephemeral: false,
    deferReply: vi.fn(), reply: vi.fn(), editReply: vi.fn(), followUp: vi.fn(), deleteReply: vi.fn() };
}
test("a command reuses its precondition acknowledgement and completes the original reply", async () => {
  const interaction = { ...fixture(), deferred: true, ephemeral: true };
  await deferCommandReply(interaction as never, { flags: MessageFlags.Ephemeral });
  await replyToCommand(interaction as never, { content: "Saved", flags: MessageFlags.Ephemeral });
  expect(interaction.deferReply).not.toHaveBeenCalled();
  expect(interaction.reply).not.toHaveBeenCalled();
  expect(interaction.editReply).toHaveBeenCalledWith({ content: "Saved" });
});
test("public deferred cards retain Components V2 while private denials remove the public placeholder", async () => {
  const interaction = { ...fixture(), deferred: true };
  await replyToCommand(interaction as never, { components: [], flags: MessageFlags.IsComponentsV2 });
  expect(interaction.editReply).toHaveBeenCalledWith({ components: [], flags: MessageFlags.IsComponentsV2 });
  interaction.editReply.mockClear();
  await replyToCommand(interaction as never, { content: "Permission denied", flags: MessageFlags.Ephemeral });
  expect(interaction.followUp).toHaveBeenCalledWith({ content: "Permission denied", flags: MessageFlags.Ephemeral });
  expect(interaction.deleteReply).toHaveBeenCalledOnce();
  expect(interaction.editReply).not.toHaveBeenCalled();
});
test.each(["ping", "help", "info", "server", "status"])("/%s is acknowledged publicly before ownership work", (commandName) => {
  expect(commandReplyOptions({ commandName } as never)).toEqual({});
});
test.each(["daily", "rank", "leaderboard"])("XP %s keeps its intended visibility", (subcommand) => {
  expect(commandReplyOptions({ commandName: "xp", options: { getSubcommand: () => subcommand } } as never))
    .toEqual(subcommand === "daily" ? { flags: MessageFlags.Ephemeral } : {});
});
test("unacknowledged replies and replies after completion use the correct endpoint", async () => {
  const interaction = fixture();
  await replyToCommand(interaction as never, "Ready");
  expect(interaction.reply).toHaveBeenCalledWith("Ready");
  interaction.replied = true;
  await replyToCommand(interaction as never, "More");
  expect(interaction.followUp).toHaveBeenCalledWith("More");
});
test("interaction diagnostics omit callback tokens", () => {
  const error = Object.assign(new Error("Failed https://discord.com/api/v10/interactions/id/secret/callback"), {
    code: 10062, url: "secret", requestBody: { token: "secret" },
  });
  expect(interactionErrorDetails(error).code).toBe(10062);
  expect(JSON.stringify(interactionErrorDetails(error))).not.toContain("secret");
});
