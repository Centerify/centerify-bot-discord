import { beforeEach, expect, test, vi } from "vitest";
import type { Client } from "discord.js";
import type { GuildConfig } from "../../src/services/guildConfigService.js";
const mocks = vi.hoisted(() => ({ upsert: vi.fn(), transaction: vi.fn(), verified: vi.fn() }));
vi.mock("../../src/prisma/db.js", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("../../src/services/guildOwnershipService.js", () => ({ guildOwnershipService: { isVerified: mocks.verified } }));
import { xpConfigurationService } from "../../src/services/xpConfigurationService.js";
const source = { guildId: "a", xpEnabled: true, xpMethods: "messages,daily", xpMessageAmount: 20, xpReactionAmount: 5, xpDailyAmount: 250,
  xpCooldownSeconds: 60, xpSharing: "selected", xpSharedGuildIds: "b", welcomeChannelId: "do-not-copy", setupCompleted: true } as GuildConfig;
function client(canManage = true) {
  const guild = (id: string) => ({ id, members: { fetch: vi.fn().mockResolvedValue({ permissions: { has: () => canManage } }) } });
  return { guilds: { cache: new Map([["a", guild("a")], ["b", guild("b")]]) } } as unknown as Client;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.verified.mockResolvedValue(true);
  mocks.transaction.mockImplementation((fn) => fn({ orm: { public: { GuildConfig: { upsert: mocks.upsert } } } }));
});
test("batch copies only XP settings and mutually links selected servers", async () => {
  expect(await xpConfigurationService.apply(client(), "admin", source, ["b", "b"])).toEqual(["a", "b"]);
  expect(mocks.transaction).toHaveBeenCalledOnce();
  expect(mocks.upsert).toHaveBeenCalledTimes(2);
  for (const [call] of mocks.upsert.mock.calls) {
    expect(call.conflictOn).toEqual({ guildId: call.create.guildId });
    expect(call.update.xpMethods).toBe("messages,daily");
    expect(call.update.xpDailyAmount).toBe(250);
    expect(call.update).not.toHaveProperty("welcomeChannelId");
    expect(call.update).not.toHaveProperty("setupCompleted");
    expect(call.update.xpSharedGuildIds).toBe(call.create.guildId === "a" ? "b" : "a");
  }
});
test("unavailable servers are rejected before any writes", async () => {
  await expect(xpConfigurationService.apply(client(), "admin", source, ["missing"])).rejects.toThrow("Centerify must be in server missing");
  expect(mocks.transaction).not.toHaveBeenCalled();
});
test("permission in every server is required before any writes", async () => {
  const bot = client();
  const target = bot.guilds.cache.get("b")!;
  vi.mocked(target.members.fetch).mockResolvedValue({ permissions: { has: () => false } } as never);
  await expect(xpConfigurationService.apply(bot, "admin", source, ["b"])).rejects.toThrow("Manage Server");
  expect(mocks.transaction).not.toHaveBeenCalled();
});
test("a target with stale owner verification blocks the entire batch", async () => {
  mocks.verified.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await expect(xpConfigurationService.apply(client(), "admin", source, ["b"])).rejects.toThrow("/verify");
  expect(mocks.transaction).not.toHaveBeenCalled();
});
test("too many targets are rejected and database failures propagate", async () => {
  await expect(xpConfigurationService.apply(client(), "admin", source, Array.from({ length: 25 }, (_, i) => String(i)))).rejects.toThrow("25 servers");
  expect(mocks.transaction).not.toHaveBeenCalled();
  mocks.upsert.mockRejectedValue(new Error("write failed"));
  await expect(xpConfigurationService.apply(client(), "admin", source, ["b"])).rejects.toThrow("write failed");
});
