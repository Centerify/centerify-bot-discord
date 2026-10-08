import { expect, test, vi } from "vitest";

vi.mock("../../../src/modules/guilds/discord/ownership.js", () => ({
  guildOwnershipService: { verify: vi.fn() },
}));
vi.mock("../../../src/adapters/logging/runtime.js", () => ({ logger: { error: vi.fn() } }));

import { VerifyCommand } from "../../../src/modules/guilds/discord/index.js";
import { guildOwnershipService } from "../../../src/modules/guilds/discord/ownership.js";
import type { Command } from "@sapphire/framework";

test("verification refuses non-owners without claiming success", async () => {
  vi.mocked(guildOwnershipService.verify).mockResolvedValue(false);
  const interaction = {
    guild: { id: "guild" },
    user: { id: "administrator" },
    deferReply: vi.fn(),
    editReply: vi.fn(),
  };
  await VerifyCommand.prototype.chatInputRun.call(
    {} as VerifyCommand,
    interaction as unknown as Command.ChatInputCommandInteraction,
  );
  expect(guildOwnershipService.verify).toHaveBeenCalledWith(interaction.guild, "administrator");
  expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining("Only the current server owner"));
});
