import { beforeEach, expect, test, vi } from "vitest";
import { PermissionFlagsBits as P, PermissionsBitField } from "discord.js";
const mocks = vi.hoisted(() => ({ config: vi.fn(), verified: vi.fn(), welcome: vi.fn() }));
vi.mock("../../../src/modules/guilds/discord/config.js", () => ({
  guildConfigService: { getOrCreate: mocks.config },
}));
vi.mock("../../../src/modules/guilds/discord/ownership.js", () => ({
  guildOwnershipService: { isVerified: mocks.verified },
}));
vi.mock("../../../src/modules/welcome/discord/greeting.js", () => ({
  greetingService: { sendWelcome: mocks.welcome },
}));
vi.mock("../../../src/adapters/logging/runtime.js", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));
import { GuildMemberAddListener } from "../../../src/modules/welcome/discord/guildMemberAdd.js";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verified.mockResolvedValue(true);
  mocks.config.mockResolvedValue({ autoRoleEnabled: true, autoRoleId: "role" });
});
function fixture(permissions: bigint[] = []) {
  const guild = {
    id: "guild",
    roles: { fetch: vi.fn() },
    members: {
      me: { permissions: new PermissionsBitField([P.ManageRoles]), roles: { highest: {} } },
      fetchMe: vi.fn(),
    },
  };
  const role = {
    id: "role",
    guild,
    managed: false,
    permissions: new PermissionsBitField(permissions),
    comparePositionTo: () => -1,
  };
  guild.roles.fetch.mockResolvedValue(role);
  const member = { id: "newcomer", guild, roles: { add: vi.fn().mockResolvedValue(undefined) } };
  return { guild, role, member, run: () => new GuildMemberAddListener().run(member as never) };
}
test("join events refuse an auto-role that acquired administrator permissions after configuration", async () => {
  const f = fixture([P.Administrator]);
  await f.run();
  expect(f.guild.roles.fetch).toHaveBeenCalledWith("role", { force: true });
  expect(f.member.roles.add).not.toHaveBeenCalled();
});
test("safe auto-roles still work after refreshing bot permissions", async () => {
  const f = fixture([P.ViewChannel]);
  await f.run();
  expect(f.guild.members.fetchMe).toHaveBeenCalledWith({ force: true });
  expect(f.member.roles.add).toHaveBeenCalledWith(f.role);
});
test("revoked verification prevents all automatic role and greeting activity", async () => {
  const f = fixture();
  mocks.verified.mockResolvedValue(false);
  await f.run();
  expect(f.member.roles.add).not.toHaveBeenCalled();
  expect(f.guild.roles.fetch).not.toHaveBeenCalled();
  expect(mocks.welcome).not.toHaveBeenCalled();
});
