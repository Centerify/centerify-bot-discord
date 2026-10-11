import { beforeEach, expect, test, vi } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { warningRoleSettings } from "../../../src/modules/guilds/index.js";
import { WarnMember } from "../../../src/modules/moderation/application/WarnMember.js";
const mocks = vi.hoisted(() => ({ load: vi.fn(), schedule: vi.fn() }));
vi.mock("../../../src/modules/guilds/discord/config.js", () => ({ guildConfigService: { getOrCreate: mocks.load } }));
vi.mock("../../../src/modules/moderation/discord/warningRoles.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../src/modules/moderation/discord/warningRoles.js")>(), scheduleWarningRoleRemoval: mocks.schedule,
}));
vi.mock("../../../src/adapters/logging/runtime.js", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
import { runWarn } from "../../../src/modules/moderation/discord/warn.js";
function fixture(duration: string | null = null) {
  const target = { id: "target", roles: { highest: { comparePositionTo: () => -1 }, add: vi.fn() } };
  const guild = { id: "guild", ownerId: "owner", name: "Server", roles: { fetch: vi.fn(), create: vi.fn() },
    members: { me: { id: "bot", permissions: { has: () => false }, roles: { highest: {} } }, fetch: vi.fn().mockResolvedValue(target) } };
  return { target, request: { inCachedGuild: () => true, guild, guildId: "guild", client: {},
    user: { id: "mod", tag: "Moderator" }, member: { id: "mod", permissions: { has: () => true }, roles: { highest: {} } },
    options: { getString: (key: string) => key === "duration" ? duration : "reason", getBoolean: () => false,
      getUser: () => ({ id: "target", bot: false, system: false, send: vi.fn().mockResolvedValue(undefined) }) }, deferReply: vi.fn(), reply: vi.fn(), editReply: vi.fn() } };
}
const record = vi.fn().mockImplementation(async (input) => ({ ...input, id: 1, caseNumber: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
const warn = new WarnMember({ countWarningsForUser: async () => 0, createCase: record });
beforeEach(() => { vi.clearAllMocks(); mocks.load.mockResolvedValue({ warningRoleSettings: warningRoleSettings({ mode: "none", defaultDurationMs: 60_000 }) }); });
test("no-role mode issues an audited timed warning without Manage Roles", async () => {
  const { request, target } = fixture();
  await runWarn(request as never, warn);
  expect(record).toHaveBeenCalledWith(expect.objectContaining({ durationMs: 60_000, metadata: { warningCount: 1, warningRoleId: null } }));
  expect(target.roles.add).not.toHaveBeenCalled();
  expect(request.guild.roles.create).not.toHaveBeenCalled();
  expect(request.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("no role assigned") }));
});
test("permanent explicitly overrides the server duration", async () => {
  await runWarn(fixture("permanent").request as never, warn);
  expect(record).toHaveBeenCalledWith(expect.objectContaining({ durationMs: null }));
  expect(mocks.schedule).not.toHaveBeenCalled();
});
test("numbered and shared modes still require bot Manage Roles", async () => {
  for (const mode of ["numbered", "single"] as const) {
    mocks.load.mockResolvedValue({ warningRoleSettings: warningRoleSettings({ mode }) });
    await runWarn(fixture().request as never, warn);
  }
  expect(record).not.toHaveBeenCalled();
});
test("no-role mode preserves the moderator's Discord permission requirement", async () => {
  const { request } = fixture();
  request.member.permissions.has = (permission?: bigint) => permission !== PermissionFlagsBits.ModerateMembers && permission !== PermissionFlagsBits.Administrator;
  await runWarn(request as never, warn);
  expect(request.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("ModerateMembers") }));
  expect(record).not.toHaveBeenCalled();
});
