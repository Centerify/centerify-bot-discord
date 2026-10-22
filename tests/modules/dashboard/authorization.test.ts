import { expect, test, vi } from "vitest";
import { PermissionsBitField, PermissionFlagsBits as P, Collection } from "discord.js";
import { DashboardService } from "../../../src/dashboard/service.js";
import { guildConfigToken, guildOwnershipToken } from "../../../src/modules/guilds/index.js";
function fixture(permissions = 0n) {
  const actor = {
    id: "111111111111111111",
    permissions: new PermissionsBitField(permissions),
    roles: { cache: new Collection() },
  };
  const guild = {
    id: "222222222222222222",
    ownerId: "333333333333333333",
    members: { fetch: vi.fn(async () => actor) },
  };
  const application = {
    extensions: () => [],
    resolve: (token: unknown) =>
      token === guildConfigToken
        ? { getOrCreate: async () => ({ ticketSettings: null }) }
        : token === guildOwnershipToken
          ? { isVerified: async () => true }
          : null,
  };
  const service = new DashboardService(
    { isReady: () => true, guilds: { cache: new Map([[guild.id, guild]]) } } as never,
    application as never,
    {} as never,
    {} as never,
  );
  return { service, actor, guild };
}
test("ordinary membership does not grant dashboard access", async () => {
  const f = fixture();
  await expect(f.service.access(f.actor.id, f.guild.id)).rejects.toMatchObject({ status: 403 });
});
test("moderators can see moderation but cannot edit configuration", async () => {
  const f = fixture(P.ModerateMembers),
    a = await f.service.access(f.actor.id, f.guild.id);
  expect(a.capabilities).toContain("moderation");
  expect(a.capabilities).not.toContain("settings");
  await expect(
    f.service.read(f.actor.id, f.guild.id, "settings", new URLSearchParams()),
  ).rejects.toMatchObject({ status: 403 });
});
test("guild IDs are resolved from the bot and membership is refreshed", async () => {
  const f = fixture(P.ManageGuild);
  await expect(f.service.access(f.actor.id, "444444444444444444")).rejects.toMatchObject({
    status: 404,
  });
  await f.service.access(f.actor.id, f.guild.id);
  expect(f.guild.members.fetch).toHaveBeenCalledWith({ user: f.actor.id, force: true });
  f.guild.members.fetch.mockResolvedValueOnce(null as never);
  await expect(f.service.access(f.actor.id, f.guild.id)).rejects.toMatchObject({ status: 403 });
});
