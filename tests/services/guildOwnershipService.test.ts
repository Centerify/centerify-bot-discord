import { beforeEach, expect, test, vi } from "vitest";
import type { Guild, RepliableInteraction } from "discord.js";

const mocks = vi.hoisted(() => ({ first: vi.fn(), upsert: vi.fn(), where: vi.fn(), delete: vi.fn() }));
vi.mock("../../src/adapters/prisma/client.js", () => ({
  db: { orm: { public: { GuildOwnership: {
    where: mocks.where, upsert: mocks.upsert,
  } } } },
}));
vi.mock("../../src/adapters/logging/runtime.js", () => ({ logger: { error: vi.fn() } }));

import { GuildOwnershipService, OWNERSHIP_REQUIRED_MESSAGE, requireVerifiedOwnership } from "../../src/modules/guilds/discord/ownership.js";
import { VerifyGuildOwnership } from "../../src/modules/guilds/index.js";
import { PrismaOwnershipRepository } from "../../src/modules/guilds/infrastructure/PrismaOwnershipRepository.js";
const service = new GuildOwnershipService(new VerifyGuildOwnership(new PrismaOwnershipRepository()));
const fetchGuild = vi.fn();
const guild = { id: "guild", ownerId: "old-owner", fetch: fetchGuild } as unknown as Guild;

beforeEach(() => {
  vi.resetAllMocks();
  fetchGuild.mockResolvedValue({ ownerId: "current-owner" });
  mocks.where.mockReturnValue({ first: mocks.first, delete: mocks.delete });
});

test("unverified servers cannot run the bot", async () => {
  mocks.first.mockResolvedValue(null);
  expect(await service.isVerified(guild)).toBe(false);
});

test("ownership transfers invalidate an existing verification", async () => {
  mocks.first.mockResolvedValue({ ownerUserId: "old-owner" });
  expect(await service.isVerified(guild)).toBe(false);
  mocks.first.mockResolvedValue({ ownerUserId: "current-owner" });
  expect(await service.isVerified(guild)).toBe(true);
});

test("database and Discord failures deny access", async () => {
  mocks.first.mockRejectedValue(new Error("database unavailable"));
  expect(await service.isVerified(guild)).toBe(false);
  fetchGuild.mockRejectedValue(new Error("Discord unavailable"));
  expect(await service.isVerified(guild)).toBe(false);
});

test("administrators and previous owners cannot authorize the bot", async () => {
  expect(await service.verify(guild, "administrator")).toBe(false);
  expect(await service.verify(guild, "old-owner")).toBe(false);
  expect(mocks.upsert).not.toHaveBeenCalled();
});

test("only the current owner can persist verification", async () => {
  expect(await service.verify(guild, "current-owner")).toBe(true);
  expect(mocks.upsert).toHaveBeenCalledWith({
    conflictOn: { guildId: "guild" },
    create: { guildId: "guild", ownerUserId: "current-owner" },
    update: { ownerUserId: "current-owner", verifiedAt: expect.any(String) },
  });
});

test("only the current owner can remove verification", async () => {
  expect(await service.unverify(guild, "administrator")).toBe(false);
  expect(await service.unverify(guild, "old-owner")).toBe(false);
  expect(mocks.delete).not.toHaveBeenCalled();

  expect(await service.unverify(guild, "current-owner")).toBe(true);
  expect(mocks.where).toHaveBeenCalledWith({ guildId: "guild" });
  expect(mocks.delete).toHaveBeenCalledOnce();
});

test("ownership denial completes a deferred reply", async () => {
  mocks.first.mockResolvedValue(null);
  const interaction = { guild, deferred: true, replied: false, editReply: vi.fn(), followUp: vi.fn(), reply: vi.fn() };
  expect(await requireVerifiedOwnership(interaction as unknown as RepliableInteraction)).toBe(false);
  expect(interaction.editReply).toHaveBeenCalledWith({ content: OWNERSHIP_REQUIRED_MESSAGE });
  expect(interaction.followUp).not.toHaveBeenCalled();
  expect(interaction.reply).not.toHaveBeenCalled();
});
