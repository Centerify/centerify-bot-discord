import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ active: vi.fn(), revoke: vi.fn(), count: vi.fn(), remove: vi.fn(), cancel: vi.fn() }));
vi.mock("../../../src/adapters/prisma/client.js", () => ({ db: {} }));
vi.mock("../../../src/modules/moderation/discord/services.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../src/modules/moderation/discord/services.js")>(),
  moderationCaseService: { activeWarningsForUser: mocks.active, revokeActiveWarning: mocks.revoke, countWarningsForUser: mocks.count },
}));
vi.mock("../../../src/modules/moderation/discord/warningRoles.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../src/modules/moderation/discord/warningRoles.js")>(),
  removeWarningRoleIfUnused: mocks.remove, cancelWarningRoleRemoval: mocks.cancel,
}));
import { UnwarnCommand } from "../../../src/modules/moderation/discord/commands/unwarn.js";
const warning = { guildId: "guild", targetUserId: "target", moderatorUserId: "mod", caseNumber: 3, action: "WARNING", reason: "reason", durationMs: null,
  metadata: { warningRoleId: null }, createdAt: "2026-10-10T00:00:00Z" };
function fixture() {
  const role = { comparePositionTo: () => -1 };
  return { inCachedGuild: () => true, guildId: "guild", client: {}, user: { id: "mod", tag: "Moderator" },
    member: { id: "mod", permissions: { has: () => true }, roles: { highest: role } },
    guild: { name: "Server", ownerId: "owner", members: { me: { id: "bot", permissions: { has: () => false }, roles: { highest: role } },
      fetch: vi.fn().mockResolvedValue({ id: "target", roles: { highest: role } }) } },
    options: { getUser: () => ({ id: "target", bot: false, system: false, send: vi.fn().mockResolvedValue(undefined) }), getString: () => "appeal", getInteger: () => null },
    reply: vi.fn(), deferReply: vi.fn(), editReply: vi.fn() };
}
beforeEach(() => { vi.clearAllMocks(); mocks.active.mockResolvedValue([warning]); mocks.revoke.mockResolvedValue(warning); mocks.count.mockResolvedValue(0); mocks.remove.mockResolvedValue("not-assigned"); });
const command = Object.create(UnwarnCommand.prototype) as UnwarnCommand;
test("revoking a no-role warning does not require bot Manage Roles", async () => {
  const f = fixture();
  await command.chatInputRun(f as never);
  expect(mocks.revoke).toHaveBeenCalledWith(expect.objectContaining({ caseNumber: 3 }));
  expect(f.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("Warning #3 removed") }));
});
test("warnings with roles retain the bot Manage Roles requirement", async () => {
  mocks.active.mockResolvedValue([{ ...warning, metadata: { warningRoleId: "role" } }]);
  await command.chatInputRun(fixture() as never);
  expect(mocks.revoke).not.toHaveBeenCalled();
});
test("no active warning does not revoke a concurrently created warning", async () => {
  mocks.active.mockResolvedValue([]);
  await command.chatInputRun(fixture() as never);
  expect(mocks.revoke).not.toHaveBeenCalled();
});
