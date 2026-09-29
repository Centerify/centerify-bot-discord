import { beforeEach, expect, test, vi } from "vitest";
import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";

const mocks = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("../../src/services/guildOwnershipService.js", () => ({
  guildOwnershipService: {},
  OWNERSHIP_REQUIRED_MESSAGE: "Verification required",
  requireVerifiedOwnership: mocks.check,
}));
import { VerifiedGuildOwnershipPrecondition } from "../../src/preconditions/verifiedGuildOwnership.js";

const precondition = Object.create(VerifiedGuildOwnershipPrecondition.prototype) as VerifiedGuildOwnershipPrecondition;
beforeEach(() => vi.resetAllMocks());

test("settings acknowledgement completes before slow ownership checks start", async () => {
  let acknowledged = false;
  const interaction = {
    commandName: "settings", deferred: false, replied: false,
    deferReply: vi.fn(async () => { acknowledged = true; }),
  };
  mocks.check.mockImplementation(async () => {
    expect(acknowledged).toBe(true);
    return true;
  });
  const result = await precondition.chatInputRun(interaction as unknown as ChatInputCommandInteraction);
  expect(result.isOk()).toBe(true);
  expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
});

test("an acknowledged settings interaction is not deferred twice", async () => {
  mocks.check.mockResolvedValue(true);
  const interaction = { commandName: "settings", deferred: true, replied: false, deferReply: vi.fn() };
  await precondition.chatInputRun(interaction as unknown as ChatInputCommandInteraction);
  expect(interaction.deferReply).not.toHaveBeenCalled();
  expect(mocks.check).toHaveBeenCalledOnce();
});

test("verify bypasses ownership checks without precondition acknowledgement", async () => {
  const interaction = { commandName: "verify", deferReply: vi.fn() };
  const result = await precondition.chatInputRun(interaction as unknown as ChatInputCommandInteraction);
  expect(result.isOk()).toBe(true);
  expect(mocks.check).not.toHaveBeenCalled();
  expect(interaction.deferReply).not.toHaveBeenCalled();
});

test("unverify remains available after verification is removed", async () => {
  const interaction = { commandName: "unverify", deferReply: vi.fn() };
  const result = await precondition.chatInputRun(interaction as unknown as ChatInputCommandInteraction);
  expect(result.isOk()).toBe(true);
  expect(mocks.check).not.toHaveBeenCalled();
  expect(interaction.deferReply).not.toHaveBeenCalled();
});
