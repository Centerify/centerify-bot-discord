import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MessageFlags } from "discord.js";

const mocks = vi.hoisted(() => ({ check: vi.fn(), list: vi.fn(), create: vi.fn() }));
vi.mock("../../../src/services/guildOwnershipService.js", () => ({
  requireVerifiedOwnership: mocks.check,
  guildOwnershipService: {},
  OWNERSHIP_REQUIRED_MESSAGE: "Verification required",
}));
vi.mock("../../../src/services/customResponseService.js", () => ({
  customResponseService: { list: mocks.list, create: mocks.create },
}));
vi.mock("../../../src/logger.js", () => ({ logger: { error: vi.fn() } }));

vi.mock("../../../src/services/customCommands/runtime.js", () => ({ customCommandService: { listCommands: async () => [] } }));

import { CustomCommand } from "../../../src/commands/admin/custom.js";
import { VerifiedGuildOwnershipPrecondition } from "../../../src/preconditions/verifiedGuildOwnership.js";

const command = Object.create(CustomCommand.prototype) as CustomCommand;
const precondition = Object.create(VerifiedGuildOwnershipPrecondition.prototype) as VerifiedGuildOwnershipPrecondition;

function fixture() {
  const receivedAt = Date.now();
  const interaction = {
    commandName: "custom", guildId: "guild-a", guild: { ownerId: "owner" },
    user: { id: "owner" }, member: { permissions: { has: () => false } },
    inCachedGuild: () => true, deferred: false, replied: false,
    options: { getSubcommand: () => "list" },
    deferReply: vi.fn(async (_options: unknown) => {
      if (interaction.deferred || interaction.replied) throw new Error("Interaction already acknowledged");
      if (Date.now() - receivedAt >= 3000) throw new Error("Unknown interaction");
      interaction.deferred = true;
    }),
    reply: vi.fn(), editReply: vi.fn(),
  };
  return interaction;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.check.mockResolvedValue(true);
  mocks.list.mockResolvedValue([]);
});
afterEach(() => { vi.useRealTimers(); });

test("slow global and command ownership checks reuse one prompt acknowledgement", async () => {
  vi.useFakeTimers();
  const interaction = fixture();
  mocks.check.mockImplementation(() => {
    expect(interaction.deferred).toBe(true);
    return new Promise((resolve) => setTimeout(() => resolve(true), 3500));
  });
  const run = (async () => {
    const result = await precondition.chatInputRun(interaction as never);
    expect(result.isOk()).toBe(true);
    await command.chatInputRun(interaction as never);
  })();
  await vi.advanceTimersByTimeAsync(7000);
  await run;
  expect(interaction.deferReply).toHaveBeenCalledExactlyOnceWith({ flags: MessageFlags.Ephemeral });
  expect(mocks.check).toHaveBeenCalledTimes(2);
  expect(mocks.list).toHaveBeenCalledWith("guild-a");
  expect(interaction.editReply).toHaveBeenCalledWith("No custom commands or events yet. Use `/custom create` to add one.");
  expect(interaction.reply).not.toHaveBeenCalled();
});

test("direct command execution also acknowledges before ownership requests", async () => {
  const interaction = fixture();
  mocks.check.mockImplementation(async () => {
    expect(interaction.deferred).toBe(true);
    return true;
  });
  await command.chatInputRun(interaction as never);
  expect(interaction.deferReply).toHaveBeenCalledOnce();
  expect(interaction.editReply).toHaveBeenCalledOnce();
});

test("unverified servers do not read or write custom rules", async () => {
  const interaction = fixture();
  mocks.check.mockResolvedValue(false);
  await command.chatInputRun(interaction as never);
  expect(interaction.deferReply).toHaveBeenCalledOnce();
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});

test("permission denial edits the precondition reply without a second acknowledgement", async () => {
  const interaction = fixture();
  interaction.deferred = true;
  interaction.user.id = "not-an-admin";
  await command.chatInputRun(interaction as never);
  expect(interaction.editReply).toHaveBeenCalledWith({ content: "Only the server owner or an administrator can manage custom rules." });
  expect(interaction.reply).not.toHaveBeenCalled();
  expect(interaction.deferReply).not.toHaveBeenCalled();
  expect(mocks.check).not.toHaveBeenCalled();
  expect(mocks.list).not.toHaveBeenCalled();
});

test("direct permission denial replies immediately without touching storage", async () => {
  const interaction = fixture();
  interaction.user.id = "not-an-admin";
  await command.chatInputRun(interaction as never);
  expect(interaction.reply).toHaveBeenCalledWith({ content: "Only the server owner or an administrator can manage custom rules.", flags: MessageFlags.Ephemeral });
  expect(interaction.deferReply).not.toHaveBeenCalled();
  expect(mocks.list).not.toHaveBeenCalled();
});
