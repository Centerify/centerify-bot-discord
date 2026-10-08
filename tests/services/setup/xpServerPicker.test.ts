import { beforeEach, expect, test, vi } from "vitest";
import type { Client } from "discord.js";
import { Collection } from "discord.js";
const mocks = vi.hoisted(() => ({ verified: vi.fn(), apply: vi.fn() }));
vi.mock("../../../src/modules/guilds/discord/ownership.js", () => ({ requireVerifiedOwnership: mocks.verified }));
vi.mock("../../../src/modules/guilds/discord/config.js", () => ({ guildConfigService: {} }));
vi.mock("../../../src/modules/xp/discord/configuration.js", () => ({ xpConfigurationService: { apply: mocks.apply } }));
import { changePageSelection, discoverXpServers, handleXpServerPicker, pickerView } from "../../../src/modules/settings/discord/xpServerPicker.js";

beforeEach(() => { vi.resetAllMocks(); mocks.verified.mockResolvedValue(true); });
const choices = Array.from({ length: 30 }, (_, i) => ({ id: String(i), name: `Server ${i}` }));
test("picker paginates and keeps saved selections without exceeding Discord limits", () => {
  const view = pickerView(choices, new Set(["0", "26"]), 0, "picker", false);
  const menu = view.components[0].toJSON().components[0] as any;
  expect(menu.options).toHaveLength(25);
  expect(menu.options[0].default).toBe(true);
  const next = changePageSelection(new Set(["0", "26"]), choices.slice(0, 25), ["2"], 25);
  expect([...next]).toEqual(["26", "2"]);
  expect(pickerView(choices, next, 1, "picker", false).content).toContain("Page 2/2");
  expect(pickerView(choices, next, 1, "picker", false).components[0].toJSON().components).toHaveLength(1);
});
test("selection rejects forged choices and exceeding the group limit", () => {
  expect(() => changePageSelection(new Set(), choices.slice(0, 25), ["29"], 25)).toThrow("current page");
  expect(() => changePageSelection(new Set(choices.slice(0, 24).map((item) => item.id)), choices.slice(25), ["26"], 24)).toThrow("at most 24");
});
test("empty discovery still offers clear, save, and cancel without an invalid empty dropdown", () => {
  const view = pickerView([], new Set(["saved"]), 0, "picker", false);
  expect(view.components).toHaveLength(1);
  expect(view.content).toContain("No servers found");
  expect(view.content).toContain("Server saved");
});
test("discovery lists only shared servers and filters apply targets by Manage Server", async () => {
  const guild = (id: string, allowed: boolean, member = true) => ({ id, name: id,
    members: { fetch: vi.fn().mockResolvedValue(member ? { permissions: { has: () => allowed } } : null) },
  });
  const source = guild("source", true);
  const managed = guild("managed", true);
  const shared = guild("shared", false);
  const absent = guild("absent", true, false);
  const client = { guilds: { cache: new Collection([source, managed, shared, absent].map((item) => [item.id, item])) } } as unknown as Client;
  expect((await discoverXpServers(client, "user", "source", false)).map((item) => item.id)).toEqual(["managed", "shared"]);
  expect((await discoverXpServers(client, "user", "source", true)).map((item) => item.id)).toEqual(["managed"]);
  expect(source.members.fetch).not.toHaveBeenCalled();
});

function fixture(action: "save" | "cancel", allowed = true) {
  const item = { customId: `xp-picker:button:${action}`, deferUpdate: vi.fn(), isStringSelectMenu: () => false,
    inCachedGuild: () => true, member: { permissions: { has: () => allowed } }, guildId: "source", followUp: vi.fn() };
  const message = { awaitMessageComponent: vi.fn().mockResolvedValueOnce(item).mockRejectedValue(new Error("timeout")) };
  const interaction = { id: "button", deferred: true, user: { id: "user" }, guildId: "source", guild: {},
    client: { guilds: { cache: new Collection() } }, deferReply: vi.fn(), editReply: vi.fn().mockResolvedValue(message) };
  const root = { editReply: vi.fn() };
  const config = { xpSharedGuildIds: "saved", xpSharing: "server" };
  const update = vi.fn().mockResolvedValue({ ...config, xpSharing: "selected" });
  const renderer = { buildScreen: vi.fn().mockReturnValue({}) };
  const run = () => handleXpServerPicker(interaction as never, root as never, config as never, "session", false, renderer as never, update);
  return { item, interaction, root, config, update, run };
}
test("saving preserves existing unavailable peers and enables selected sharing", async () => {
  const f = fixture("save");
  await f.run();
  expect(f.update).toHaveBeenCalledWith("source", { xpSharing: "selected", xpSharedGuildIds: "saved" });
  expect(f.root.editReply).toHaveBeenCalledOnce();
  expect(f.interaction.deferReply).not.toHaveBeenCalled();
});
test("cancel leaves settings untouched and removes controls", async () => {
  const f = fixture("cancel");
  expect(await f.run()).toBe(f.config);
  expect(f.update).not.toHaveBeenCalled();
  expect(f.interaction.editReply).toHaveBeenLastCalledWith({ content: "Cancelled. XP settings were not changed.", components: [] });
});
test("revoked permissions prevent saving and timeout removes controls", async () => {
  const f = fixture("save", false);
  await f.run();
  expect(f.update).not.toHaveBeenCalled();
  expect(f.item.followUp).toHaveBeenCalled();
  expect(f.interaction.editReply).toHaveBeenLastCalledWith(expect.objectContaining({ components: [] }));
});
