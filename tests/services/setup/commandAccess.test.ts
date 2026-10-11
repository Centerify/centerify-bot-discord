import { beforeEach, expect, test, vi } from "vitest";
import type { GuildConfig } from "../../../src/modules/guilds/index.js";
import { CommandAccessEditor, buildCommandAccessScreen } from "../../../src/modules/settings/discord/commandAccess.js";
const allowed = "123456789012345678", denied = "223456789012345678";
const guild = { client: { stores: new Map([["commands", new Map(["warn", "ping", "settings", "verify", "setup", "unverify"].map((name) => [name, {}]))]]) },
  roles: { fetch: vi.fn(), cache: new Map([[allowed, {}], [denied, {}]]) } };
const config = { guildId: "guild", commandRoleAccess: { ping: { allowedRoleIds: [], deniedRoleIds: [denied] } } } as GuildConfig;
const update = vi.fn().mockImplementation(async (_id, data) => ({ ...config, ...data }));
function fixture(action: string, values: string[] = []) {
  return { customId: `setup:session:${action}`, guild, guildId: "guild", values,
    isRoleSelectMenu: () => action.includes("RoleIds"), isButton: () => action.includes("clear"),
    isStringSelectMenu: () => false, editReply: vi.fn(), followUp: vi.fn() };
}
beforeEach(() => vi.clearAllMocks());
test("command menu excludes recovery commands and shows existing selections", () => {
  const view = buildCommandAccessScreen(guild as never, config, "session", "ping");
  const rows = view.components!.map((row: any) => row.toJSON());
  expect(rows[1].components[0].options.map((item: any) => item.value)).toEqual(["ping", "warn"]);
  expect(rows[3].components[0].default_values).toEqual([{ id: denied, type: "role" }]);
});
test("saving and clearing one command preserves other command rules", async () => {
  const editor = new CommandAccessEditor();
  const next = await editor.handle(fixture("command-access-allowedRoleIds:warn", [allowed]) as never, config, "session", update);
  expect(update).toHaveBeenLastCalledWith("guild", { commandRoleAccess: { ping: { allowedRoleIds: [], deniedRoleIds: [denied] }, warn: { allowedRoleIds: [allowed], deniedRoleIds: [] } } });
  await editor.handle(fixture("command-access-clear:warn") as never, next, "session", update);
  expect(update).toHaveBeenLastCalledWith("guild", { commandRoleAccess: config.commandRoleAccess });
});
test("forged protected commands and roles from another server cannot be saved", async () => {
  const editor = new CommandAccessEditor();
  for (const [name, roles] of [["settings", [allowed]], ["warn", ["323456789012345678"]]] as const) {
    const f = fixture(`command-access-allowedRoleIds:${name}`, [...roles]);
    await editor.handle(f as never, config, "session", update);
    expect(f.followUp).toHaveBeenCalledOnce();
  }
  expect(update).not.toHaveBeenCalled();
});
