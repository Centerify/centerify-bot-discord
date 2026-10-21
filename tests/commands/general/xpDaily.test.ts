import { beforeEach, expect, test, vi } from "vitest";
import { MessageFlags } from "discord.js";
import type { Command } from "@sapphire/framework";
const mocks = vi.hoisted(() => ({ earn: vi.fn(), totals: vi.fn(), error: vi.fn() }));
vi.mock("../../../src/modules/xp/discord/services.js", () => ({
  xpService: { earn: mocks.earn, totals: mocks.totals },
}));
vi.mock("../../../src/adapters/logging/runtime.js", () => ({ logger: { error: mocks.error } }));
import { XpCommand } from "../../../src/modules/xp/discord/index.js";
const command = Object.create(XpCommand.prototype) as XpCommand;
const interaction = () => ({
  inCachedGuild: () => true,
  guildId: "server",
  user: { id: "member" },
  options: { getSubcommand: () => "daily" },
  deferReply: vi.fn(),
  editReply: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
});

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
  for (const [status, expected] of [
    ["disabled", "disabled"],
    ["cooldown", "24 hours"],
  ]) {
    const request = interaction();
    mocks.earn.mockResolvedValue({ status, amount: 100 });
    await command.chatInputRun(request as unknown as Command.ChatInputCommandInteraction);
    expect(request.editReply.mock.calls[0][0].content).toContain(expected);
  }
});

test("daily completes the precondition's private acknowledgement without deferring again", async () => {
  const request = { ...interaction(), deferred: true };
  mocks.earn.mockResolvedValue({ status: "awarded", amount: 250 });
  await command.chatInputRun(request as never);
  expect(request.deferReply).not.toHaveBeenCalled();
  expect(request.editReply).toHaveBeenCalledWith({ content: "You earned 250 daily XP!" });
});
