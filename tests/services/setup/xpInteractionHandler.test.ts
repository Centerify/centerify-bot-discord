import { beforeEach, expect, test, vi } from "vitest";
import type { GuildConfig } from "../../../src/services/guildConfigService.js";
const mocks = vi.hoisted(() => ({ verified: vi.fn(), apply: vi.fn(), load: vi.fn(), update: vi.fn(), build: vi.fn() }));
vi.mock("../../../src/services/guildOwnershipService.js", () => ({ requireVerifiedOwnership: mocks.verified }));
vi.mock("../../../src/services/xpConfigurationService.js", () => ({ xpConfigurationService: { apply: mocks.apply } }));
vi.mock("../../../src/services/guildConfigService.js", () => ({ guildConfigService: { getOrCreate: mocks.load } }));
import { handleXpModal } from "../../../src/services/setup/xpInteractionHandler.js";
const config = { guildId: "123456789012345678", xpMessageAmount: 15, xpReactionAmount: 5, xpDailyAmount: 100, xpCooldownSeconds: 60, xpSharedGuildIds: "" } as GuildConfig;
function fixture(values: Record<string, string>) {
  const submit = { user: { id: "admin" }, member: { permissions: { has: () => true } }, guildId: config.guildId,
    guild: {}, client: {}, fields: { getTextInputValue: (id: string) => values[id] }, deferReply: vi.fn(), editReply: vi.fn() };
  const button = { user: { id: "admin" }, showModal: vi.fn(), awaitModalSubmit: vi.fn().mockResolvedValue(submit) };
  const root = { editReply: vi.fn() };
  return { submit, button, root };
}
async function run(f: ReturnType<typeof fixture>, action: "xp-rewards" | "xp-peers" | "xp-apply") {
  return handleXpModal(f.button as never, f.root as never, config, "session", action, { buildScreen: mocks.build } as never, mocks.update);
}
beforeEach(() => { vi.resetAllMocks(); mocks.verified.mockResolvedValue(true); mocks.update.mockResolvedValue(config); mocks.load.mockResolvedValue(config); });
test("reward modal saves valid amounts and cooldown", async () => {
  const f = fixture({ messages: "20", reactions: "10", daily: "250", cooldown: "90" });
  await run(f, "xp-rewards");
  expect(mocks.update).toHaveBeenCalledWith(config.guildId, { xpMessageAmount: 20, xpReactionAmount: 10, xpDailyAmount: 250, xpCooldownSeconds: 90 });
  expect(f.root.editReply).toHaveBeenCalledOnce();
});
test("invalid numbers and out-of-range values do not change rewards", async () => {
  for (const text of ["-1", "1.5", "10001", "0", "oops"]) {
    const f = fixture({ messages: text, reactions: "10", daily: "250", cooldown: "60" });
    await run(f, "xp-rewards");
    expect(f.submit.editReply).toHaveBeenCalledOnce();
  }
  const f = fixture({ messages: "15", reactions: "5", daily: "100", cooldown: "9" });
  await run(f, "xp-rewards");
  expect(mocks.update).not.toHaveBeenCalled();
});
test("selected peers validate IDs, remove the current server, and support clearing", async () => {
  await run(fixture({ servers: `${config.guildId},223456789012345678` }), "xp-peers");
  expect(mocks.update).toHaveBeenLastCalledWith(config.guildId, { xpSharedGuildIds: "223456789012345678" });
  await run(fixture({ servers: "clear" }), "xp-peers");
  expect(mocks.update).toHaveBeenLastCalledWith(config.guildId, { xpSharedGuildIds: "" });
});
test("batch apply reports saved server count and refreshes the source config", async () => {
  mocks.apply.mockResolvedValue([config.guildId, "223456789012345678"]);
  const f = fixture({ servers: "223456789012345678" });
  await run(f, "xp-apply");
  expect(mocks.apply).toHaveBeenCalledWith(f.submit.client, "admin", config, ["223456789012345678"]);
  expect(mocks.load).toHaveBeenCalledWith(config.guildId);
  expect(f.submit.editReply).toHaveBeenCalledWith({ content: "XP configuration applied to 2 servers." });
});
test("permission changes after opening the modal block saves", async () => {
  const f = fixture({ servers: "223456789012345678" });
  f.submit.member.permissions.has = () => false;
  await run(f, "xp-apply");
  expect(mocks.apply).not.toHaveBeenCalled();
});
test("modal timeout leaves saved configuration unchanged", async () => {
  const f = fixture({});
  f.button.awaitModalSubmit.mockRejectedValue(new Error("timeout"));
  expect(await run(f, "xp-rewards")).toBe(config);
  expect(mocks.update).not.toHaveBeenCalled();
});
