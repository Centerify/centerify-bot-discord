import { beforeEach, expect, test, vi } from "vitest";
import { MessageFlags } from "discord.js";
import type { Command } from "@sapphire/framework";
const mocks = vi.hoisted(() => ({ earn: vi.fn(), totals: vi.fn(), error: vi.fn() }));
vi.mock("../../../src/services/xpService.js", () => ({ xpService: { earn: mocks.earn, totals: mocks.totals } }));
vi.mock("../../../src/logger.js", () => ({ logger: { error: mocks.error } }));
import { XpCommand } from "../../../src/commands/general/xp.js";
const command = Object.create(XpCommand.prototype) as XpCommand;
const interaction = () => ({
  inCachedGuild: () => true, guildId: "server", user: { id: "member" },
  options: { getSubcommand: () => "daily" }, deferReply: vi.fn(), editReply: vi.fn(),
});

beforeEach(() => { vi.clearAllMocks(); });

test("daily claims are private and show the configured reward", async () => {
  const request = interaction();
  mocks.earn.mockResolvedValue({ status: "awarded", amount: 250 });
  await command.chatInputRun(request as unknown as Command.ChatInputCommandInteraction);
  expect(request.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
  expect(mocks.earn).toHaveBeenCalledWith("server", "member", "daily");
  expect(request.editReply).toHaveBeenCalledWith({ content: "You earned 250 daily XP!" });
  expect(mocks.totals).not.toHaveBeenCalled();
});

test("disabled and cooldown claims explain why no XP was earned", async () => {
  for (const [status, expected] of [["disabled", "disabled"], ["cooldown", "24 hours"]]) {
    const request = interaction();
    mocks.earn.mockResolvedValue({ status, amount: 100 });
    await command.chatInputRun(request as unknown as Command.ChatInputCommandInteraction);
    expect(request.editReply.mock.calls[0][0].content).toContain(expected);
  }
});
