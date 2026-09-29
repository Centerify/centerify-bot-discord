import { expect, test, vi } from "vitest";
import type { Guild } from "discord.js";
import type { GuildConfig } from "../../../src/services/guildConfigService.js";
import { SetupRenderer } from "../../../src/services/setup/renderer.js";

vi.mock("../../../src/prisma/db.js", () => ({ db: {} }));

const renderer = new SetupRenderer();
const guild = { name: "Server", iconURL: () => null } as unknown as Guild;
const config = { xpEnabled: true, xpMethods: "messages,daily", xpSharing: "selected", xpSharedGuildIds: "123456789012345678",
  xpMessageAmount: 15, xpReactionAmount: 5, xpDailyAmount: 250, xpCooldownSeconds: 60 } as GuildConfig;

test("XP setup has a real multi-select earning menu with saved defaults", () => {
  const view = renderer.buildScreen("xp", guild, config, "session");
  const rows = view.components!.map((row) => "toJSON" in row ? row.toJSON() : row) as any[];
  expect(rows).toHaveLength(4);
  expect(rows[0].components.map((item: any) => item.custom_id)).toContain("setup:session:xp-apply");
  const methods = rows[1].components[0];
  expect(methods.min_values).toBe(1);
  expect(methods.max_values).toBe(3);
  expect(methods.options.filter((item: any) => item.default).map((item: any) => item.value)).toEqual(["messages", "daily"]);
  expect(rows[2].components[0].options.find((item: any) => item.default).value).toBe("selected");
  const embed = (view.embeds![0] as any).toJSON();
  expect(embed.description).toContain("Daily 250");
});
test("setup home and completion include XP without exceeding component row limits", () => {
  const view = renderer.buildScreen("main", guild, config, "session");
  const rows = view.components!.map((row) => "toJSON" in row ? row.toJSON() : row) as any[];
  expect(rows.every((row) => row.components.length <= 5)).toBe(true);
  expect(rows.flatMap((row) => row.components).some((item) => item.custom_id === "setup:session:xp")).toBe(true);
  expect((renderer.buildFinishScreen(guild, config).embeds![0] as any).toJSON().description).toContain("**XP:** messages,daily");
});

test("long greeting templates stay within Discord's embed field limits", () => {
  const view = renderer.buildScreen("welcome", guild, { ...config, welcomeMessage: "a".repeat(1500) }, "session");
  const embed = (view.embeds![0] as any).toJSON();
  expect(embed.fields.every((field: any) => field.value.length <= 1024)).toBe(true);
});
