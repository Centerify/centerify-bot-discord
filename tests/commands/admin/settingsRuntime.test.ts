import { beforeEach, expect, test, vi } from "vitest";
import type { Command } from "@sapphire/framework";
const mocks = vi.hoisted(() => ({ load: vi.fn(), update: vi.fn(), handle: vi.fn() }));
vi.mock("../../../src/services/setup/interactionHandler.js", () => ({ SetupInteractionHandler: class { handleComponent = mocks.handle; } }));
vi.mock("../../../src/services/guildConfigService.js", () => ({ guildConfigService: { getOrCreate: mocks.load, update: mocks.update } }));
vi.mock("../../../src/logger.js", () => ({ logger: { error: vi.fn() } }));
import { SettingsCommand } from "../../../src/commands/admin/settings.js";
function fixture() {
  const callbacks: Record<string, (...args: any[]) => any> = {};
  const collector = { on: vi.fn((event, callback) => { callbacks[event] = callback; }), resetTimer: vi.fn(), stop: vi.fn() };
  const message = { createMessageComponentCollector: vi.fn(() => collector) };
  return { id: "settings-session", user: { id: "admin" }, callbacks, collector, message,
    inCachedGuild: () => true, guildId: "guild", member: { permissions: { has: () => true } },
    guild: { name: "Server", iconURL: () => null }, deferReply: vi.fn(), editReply: vi.fn().mockResolvedValue(message), reply: vi.fn() };
}
const config = { xpEnabled: true, xpMethods: "messages,daily", xpSharing: "server", xpSharedGuildIds: "", xpMessageAmount: 15,
  xpReactionAmount: 5, xpDailyAmount: 250, xpCooldownSeconds: 60, welcomeMessage: "Welcome", goodbyeMessage: "Goodbye" };
const command = Object.create(SettingsCommand.prototype) as SettingsCommand;
beforeEach(() => { vi.resetAllMocks(); mocks.load.mockResolvedValue(config); mocks.update.mockResolvedValue(config); });
test("settings acknowledges before database work and edits the deferred reply", async () => {
  const f = fixture();
  mocks.load.mockImplementation(async () => { expect(f.deferReply).toHaveBeenCalledOnce(); return config; });
  await command.chatInputRun(f as unknown as Command.ChatInputCommandInteraction);
  expect(f.reply).not.toHaveBeenCalled();
  expect(f.editReply).toHaveBeenCalledOnce();
});
test("settings database failures respond through the acknowledged interaction", async () => {
  mocks.load.mockRejectedValue(new Error("offline"));
  const f = fixture();
  await command.chatInputRun(f as unknown as Command.ChatInputCommandInteraction);
  expect(f.editReply).toHaveBeenCalledWith({ content: "I could not load this server's settings right now." });
  expect(f.reply).not.toHaveBeenCalled();
});
test("settings reuses the acknowledgement from the ownership precondition", async () => {
  const f = { ...fixture(), deferred: true };
  await command.chatInputRun(f as unknown as Command.ChatInputCommandInteraction);
  expect(f.deferReply).not.toHaveBeenCalled();
  expect(f.editReply).toHaveBeenCalledOnce();
  expect(f.reply).not.toHaveBeenCalled();
});
test("permission denial does not reach the database", async () => {
  const denied = fixture();
  denied.member.permissions.has = () => false;
  await command.chatInputRun(denied as unknown as Command.ChatInputCommandInteraction);
  expect(mocks.load).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

function button(action = "xp-peers", userId = "admin") {
  return { customId: `settings:settings-session:${action}`, user: { id: userId }, member: { permissions: { has: () => true } },
    isButton: () => true, inCachedGuild: () => true, deferReply: vi.fn(), reply: vi.fn(), editReply: vi.fn(), deferred: false, replied: false };
}
test("settings keeps XP server controls inside the XP section", async () => {
  const f = fixture();
  await command.chatInputRun(f as unknown as Command.ChatInputCommandInteraction);
  const view = f.editReply.mock.calls[0][0];
  const labels = view.components.flatMap((row: any) => row.toJSON().components.map((item: any) => item.label));
  expect(labels).toEqual(expect.arrayContaining(["XP", "Welcome", "Goodbye", "Auto Role", "Logging", "Global Moderation"]));
  expect(labels).not.toContain("Choose XP Servers");
  expect(labels).not.toContain("Apply XP to Servers");
  expect(view.components).toHaveLength(2);
  expect(view.content).toBe("Choose a section below to manage settings.");
});
test("settings controls reject other users and expired sessions remove controls", async () => {
  const f = fixture();
  await command.chatInputRun(f as unknown as Command.ChatInputCommandInteraction);
  const b = { ...button("xp-peers", "other"), customId: "setup:settings-session:xp-peers" };
  await f.callbacks.collect(b);
  expect(b.reply).toHaveBeenCalledOnce();
  expect(mocks.handle).not.toHaveBeenCalled();
  f.callbacks.end();
  expect(f.editReply).toHaveBeenLastCalledWith({ components: [] });
});

test("configuration category buttons route through the shared settings handler", async () => {
  const f = fixture();
  mocks.handle.mockResolvedValue(config);
  await command.chatInputRun(f as unknown as Command.ChatInputCommandInteraction);
  for (const action of ["xp", "welcome", "goodbye", "autorole", "logging", "moderation"]) {
    const b = { ...button(), customId: `setup:settings-session:${action}` };
    await f.callbacks.collect(b);
    expect(mocks.handle).toHaveBeenLastCalledWith(expect.objectContaining({ componentInteraction: b, config }));
  }
});

test("settings prevents concurrent saves and Done closes the session", async () => {
  const f = fixture();
  await command.chatInputRun(f as unknown as Command.ChatInputCommandInteraction);
  let finish!: (value: unknown) => void;
  mocks.handle.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const first = f.callbacks.collect({ ...button(), customId: "setup:settings-session:xp" });
  const second = { ...button(), customId: "setup:settings-session:xp-peers" };
  await f.callbacks.collect(second);
  expect(second.reply).toHaveBeenCalledWith(expect.objectContaining({ content: "Finish the current settings action first." }));
  expect(mocks.handle).toHaveBeenCalledOnce();
  finish(config);
  await first;
  mocks.handle.mockImplementation(async ({ componentInteraction }) => { componentInteraction.deferred = true; return config; });
  await f.callbacks.collect({ ...button(), customId: "setup:settings-session:finish" });
  expect(f.collector.stop).toHaveBeenCalledWith("finished");
});
