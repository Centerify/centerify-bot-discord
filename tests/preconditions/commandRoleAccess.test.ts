import { beforeEach, expect, test, vi } from "vitest";
import type { ChatInputCommandInteraction } from "discord.js";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../../src/modules/guilds/discord/config.js", () => ({ guildConfigService: { getOrCreate: mocks.load } }));
vi.mock("../../src/adapters/logging/runtime.js", () => ({ logger: { error: vi.fn() } }));
import { CommandRoleAccessPrecondition } from "../../src/modules/guilds/discord/commandRoleAccess.js";
const precondition = Object.create(CommandRoleAccessPrecondition.prototype) as CommandRoleAccessPrecondition;
const role = "123456789012345678";
function fixture(roles: string[] = []) {
  return { commandName: "warn", guildId: "guild", user: { id: "user" }, inCachedGuild: () => true,
    guild: { members: { fetch: vi.fn().mockResolvedValue({ roles: { cache: new Map(roles.map((id) => [id, {}])) } }) } },
    deferred: false, replied: false, reply: vi.fn(), editReply: vi.fn(), followUp: vi.fn() };
}
beforeEach(() => { vi.resetAllMocks(); mocks.load.mockResolvedValue({}); });
test("unrestricted commands avoid a member fetch", async () => {
  const f = fixture();
  expect((await precondition.chatInputRun(f as unknown as ChatInputCommandInteraction)).isOk()).toBe(true);
  expect(f.guild.members.fetch).not.toHaveBeenCalled();
});
test("role restrictions use fresh membership and reject missing roles before command execution", async () => {
  mocks.load.mockResolvedValue({ commandRoleAccess: { warn: { allowedRoleIds: [role] } } });
  const denied = fixture();
  expect((await precondition.chatInputRun(denied as unknown as ChatInputCommandInteraction)).isErr()).toBe(true);
  expect(denied.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("allowed roles") }));
  expect(denied.guild.members.fetch).toHaveBeenCalledWith({ user: "user", force: true });
  expect((await precondition.chatInputRun(fixture([role]) as unknown as ChatInputCommandInteraction)).isOk()).toBe(true);
});
test("access check failures fail closed and complete the deferred reply", async () => {
  mocks.load.mockRejectedValue(new Error("offline"));
  const f = { ...fixture(), deferred: true };
  expect((await precondition.chatInputRun(f as unknown as ChatInputCommandInteraction)).isErr()).toBe(true);
  expect(f.reply).not.toHaveBeenCalled();
  expect(f.editReply).toHaveBeenCalledOnce();
  expect(f.followUp).not.toHaveBeenCalled();
});
test.each(["settings", "setup", "verify", "unverify"])("/%s stays available for recovery", async (commandName) => {
  expect((await precondition.chatInputRun({ ...fixture(), commandName } as unknown as ChatInputCommandInteraction)).isOk()).toBe(true);
  expect(mocks.load).not.toHaveBeenCalled();
});
