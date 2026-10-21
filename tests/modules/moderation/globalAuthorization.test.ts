import { beforeEach, expect, test, vi } from "vitest";
import { PermissionFlagsBits as P, PermissionsBitField } from "discord.js";
const mocks = vi.hoisted(() => ({ verified: vi.fn(), config: vi.fn() }));
vi.mock("../../../src/modules/guilds/discord/ownership.js", () => ({
  guildOwnershipService: { isVerified: mocks.verified },
}));
vi.mock("../../../src/modules/guilds/discord/config.js", () => ({
  guildConfigService: { getOrCreate: mocks.config },
}));
import { authorizeGlobalModerator } from "../../../src/modules/moderation/discord/globalAuthorization.js";
import {
  fetchOptionalMember,
  validateMemberAction,
} from "../../../src/modules/moderation/discord/permissionGuards.js";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.verified.mockResolvedValue(true);
  mocks.config.mockResolvedValue({
    globalBanEnabled: true,
    globalWarnEnabled: true,
    globalNoteEnabled: true,
  });
});
function fixture(permissions: bigint[] = [P.BanMembers, P.ModerateMembers]) {
  const guild = {
    id: "destination",
    ownerId: "owner",
    fetch: vi.fn(),
    members: { fetch: vi.fn() },
  };
  const member = {
    id: "actor",
    guild,
    permissions: new PermissionsBitField(permissions),
    roles: { cache: new Map() },
  };
  guild.fetch.mockResolvedValue(guild);
  guild.members.fetch.mockResolvedValue(member);
  return {
    guild,
    member,
    authorize: (action: "ban" | "warn" | "note" = "ban") =>
      authorizeGlobalModerator(guild as never, member.id, action),
  };
}
test.each(["ban", "warn", "note"] as const)(
  "%s requires current destination membership and permission",
  async (action) => {
    const f = fixture([]);
    expect(await f.authorize(action)).toBeNull();
    expect(f.guild.members.fetch).toHaveBeenCalledWith({ user: "actor", force: true });
    f.member.permissions = new PermissionsBitField([P.BanMembers, P.ModerateMembers]);
    expect(await f.authorize(action)).toBe(f.member);
    f.guild.members.fetch.mockRejectedValue(new Error("left the destination"));
    expect(await f.authorize(action)).toBeNull();
  },
);
test("ownership revocation, opt-out and REST/storage outages deny authorization", async () => {
  const f = fixture();
  mocks.verified.mockResolvedValue(false);
  expect(await f.authorize()).toBeNull();
  expect(f.guild.members.fetch).not.toHaveBeenCalled();
  mocks.verified.mockResolvedValue(true);
  mocks.config.mockResolvedValue({ globalBanEnabled: false });
  expect(await f.authorize()).toBeNull();
  mocks.config.mockRejectedValue(new Error("storage"));
  expect(await f.authorize()).toBeNull();
  f.guild.fetch.mockRejectedValue(new Error("REST unavailable"));
  expect(await f.authorize()).toBeNull();
});
test("destination role denials apply even to administrators", async () => {
  const f = fixture([P.Administrator]);
  const deniedRole = "123456789012345678";
  f.member.roles.cache.set(deniedRole, {} as never);
  mocks.config.mockResolvedValue({
    globalBanEnabled: true,
    commandRoleAccess: { ban: { allowedRoleIds: [], deniedRoleIds: [deniedRole] } },
  });
  expect(await f.authorize()).toBeNull();
});
test("only an explicit Unknown Member allows a non-member ban; network and permission failures propagate", async () => {
  const f = fixture();
  f.guild.members.fetch.mockRejectedValue({ code: 10007 });
  expect(await fetchOptionalMember(f.guild as never, "target")).toBeNull();
  for (const error of [{ code: 50013 }, { code: 429 }, new Error("timeout")]) {
    f.guild.members.fetch.mockRejectedValue(error);
    await expect(fetchOptionalMember(f.guild as never, "target")).rejects.toEqual(error);
  }
});
test("destination role hierarchy protects its owner, peers and higher members", () => {
  const guild = {
    ownerId: "owner",
    members: { me: { id: "bot", roles: { highest: { position: 100 } } } },
  };
  const moderator = { id: "actor", roles: { highest: { position: 10 } } };
  const target = {
    id: "target",
    roles: { highest: { comparePositionTo: (role: { position: number }) => 20 - role.position } },
  };
  const validate = () => validateMemberAction({ guild, moderator, target } as never);
  expect(validate()).toContain("not below yours");
  target.id = "owner";
  expect(validate()).toContain("server owner");
});
