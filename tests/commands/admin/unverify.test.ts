import { beforeEach, expect, test, vi } from "vitest";
import type { Command } from "@sapphire/framework";

const mocks = vi.hoisted(() => ({ unverify: vi.fn(), error: vi.fn() }));
vi.mock("../../../src/services/guildOwnershipService.js", () => ({ guildOwnershipService: { unverify: mocks.unverify } }));
vi.mock("../../../src/logger.js", () => ({ logger: { error: mocks.error } }));

import { UnverifyCommand } from "../../../src/commands/admin/unverify.js";

function interaction(userId = "owner") {
  return {
    guild: { id: "guild" }, guildId: "guild", user: { id: userId },
    deferReply: vi.fn(), editReply: vi.fn(),
  };
}

beforeEach(() => vi.resetAllMocks());

test("current owner can revoke verification", async () => {
  mocks.unverify.mockResolvedValue(true);
  const request = interaction();
  await UnverifyCommand.prototype.chatInputRun.call({} as UnverifyCommand, request as unknown as Command.ChatInputCommandInteraction);
  expect(request.deferReply).toHaveBeenCalledOnce();
  expect(mocks.unverify).toHaveBeenCalledWith(request.guild, "owner");
  expect(request.editReply).toHaveBeenCalledWith(expect.stringContaining("verification removed"));
});

test("non-owners cannot revoke verification", async () => {
  mocks.unverify.mockResolvedValue(false);
  const request = interaction("administrator");
  await UnverifyCommand.prototype.chatInputRun.call({} as UnverifyCommand, request as unknown as Command.ChatInputCommandInteraction);
  expect(request.editReply).toHaveBeenCalledWith(expect.stringContaining("Only the current server owner"));
});

test("database failures do not claim verification was removed", async () => {
  mocks.unverify.mockRejectedValue(new Error("database unavailable"));
  const request = interaction();
  await UnverifyCommand.prototype.chatInputRun.call({} as UnverifyCommand, request as unknown as Command.ChatInputCommandInteraction);
  expect(request.editReply).toHaveBeenCalledWith(expect.stringContaining("could not remove verification"));
  expect(mocks.error).toHaveBeenCalledOnce();
});
