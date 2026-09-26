import { beforeEach, expect, test, vi } from "vitest";
import type { Guild } from "discord.js";

const mocks = vi.hoisted(() => ({ first: vi.fn(), upsert: vi.fn() }));
vi.mock("../../src/prisma/db.js", () => ({
  db: { orm: { public: { GuildOwnership: {
    where: () => ({ first: mocks.first }), upsert: mocks.upsert,
  } } } },
}));
vi.mock("../../src/logger.js", () => ({ logger: { error: vi.fn() } }));

import { GuildOwnershipService } from "../../src/services/guildOwnershipService.js";
const service = new GuildOwnershipService();
const fetchGuild = vi.fn();
const guild = { id: "guild", ownerId: "old-owner", fetch: fetchGuild } as unknown as Guild;

beforeEach(() => {
  vi.resetAllMocks();
  fetchGuild.mockResolvedValue({ ownerId: "current-owner" });
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
    create: { guildId: "guild", ownerUserId: "current-owner" },
    update: { ownerUserId: "current-owner", verifiedAt: expect.any(String) },
  });
});
