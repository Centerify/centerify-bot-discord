import { beforeEach, expect, test, vi } from "vitest";
import type { GuildConfig } from "../../../src/services/guildConfigService.js";
const mocks = vi.hoisted(() => ({ verified: vi.fn(), update: vi.fn(), build: vi.fn() }));
vi.mock("../../../src/services/guildOwnershipService.js", () => ({ requireVerifiedOwnership: mocks.verified }));
vi.mock("../../../src/services/guildConfigService.js", () => ({ guildConfigService: {} }));
vi.mock("../../../src/prisma/db.js", () => ({ db: {} }));
import { SetupInteractionHandler } from "../../../src/services/setup/interactionHandler.js";
import type { SetupRenderer } from "../../../src/services/setup/renderer.js";
const config = { xpEnabled: true, xpMethods: "messages" } as GuildConfig;
const handler = new SetupInteractionHandler({ buildScreen: mocks.build } as unknown as SetupRenderer, mocks.update);
function request(action: string, values: string[] = [], button = false) {
  return { customId: `setup:session:${action}`, values, user: { id: "admin" }, member: { permissions: { has: () => true } },
    guild: {}, guildId: "server", isStringSelectMenu: () => !button, isButton: () => button,
    reply: vi.fn(), followUp: vi.fn(), deferUpdate: vi.fn(async function (this: any) { this.deferred = true; }), deferred: false, editReply: vi.fn(), update: vi.fn() };
}
async function run(item: ReturnType<typeof request>) {
  const root = { user: { id: "admin" }, editReply: vi.fn() };
  const next = await handler.handleComponent({ componentInteraction: item as never, rootInteraction: root as never, config, sessionId: "session" });
  return { root, next };
}
beforeEach(() => { vi.resetAllMocks(); mocks.verified.mockResolvedValue(true); mocks.update.mockImplementation((_id, update) => ({ ...config, ...update })); });
test("selecting multiple methods persists the combination without silently enabling XP", async () => {
  const item = request("xp-methods", ["daily", "messages"]);
  const { next } = await run(item);
  expect(mocks.update).toHaveBeenCalledWith("server", { xpMethods: "messages,daily" });
  expect(next.xpMethods).toBe("messages,daily");
  expect(item.deferUpdate).toHaveBeenCalledOnce();
});
test("sharing selection and enable toggle save the correct fields", async () => {
  await run(request("xp-sharing", ["global"]));
  expect(mocks.update).toHaveBeenLastCalledWith("server", { xpSharing: "global" });
  await run(request("xp-toggle", [], true));
  expect(mocks.update).toHaveBeenLastCalledWith("server", { xpEnabled: false });
});
test("empty or unsupported earning selections are rejected without saving", async () => {
  for (const values of [[], ["voice"], ["messages", "unknown"]]) {
    const item = request("xp-methods", values);
    await run(item);
    expect(item.followUp).toHaveBeenCalledOnce();
  }
  expect(mocks.update).not.toHaveBeenCalled();
});
test("permission revocation and a different session user prevent edits", async () => {
  const denied = request("xp-toggle", [], true);
  denied.member.permissions.has = () => false;
  await run(denied);
  const other = request("xp-toggle", [], true);
  other.user.id = "other";
  await run(other);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.verified).not.toHaveBeenCalled();
});
test("lost ownership verification blocks edits", async () => {
  mocks.verified.mockResolvedValue(false);
  await run(request("xp-sharing", ["selected"]));
  expect(mocks.update).not.toHaveBeenCalled();
});

test("all configuration categories acknowledge before ownership checks and render their controls", async () => {
  for (const action of ["xp", "welcome", "goodbye", "autorole", "logging", "moderation", "main"]) {
    const item = request(action, [], true);
    mocks.verified.mockImplementation(async () => { expect(item.deferUpdate).toHaveBeenCalledOnce(); return true; });
    await run(item);
    expect(mocks.build).toHaveBeenLastCalledWith(action, item.guild, config, "session");
    expect(item.editReply).toHaveBeenCalledOnce();
  }
});
