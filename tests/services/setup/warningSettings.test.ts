import { beforeEach, expect, test, vi } from "vitest";
import type { GuildConfig } from "../../../src/modules/guilds/index.js";
const mocks = vi.hoisted(() => ({ verified: vi.fn() }));
vi.mock("../../../src/modules/guilds/discord/ownership.js", () => ({
  requireVerifiedOwnership: mocks.verified,
}));
vi.mock("../../../src/adapters/prisma/client.js", () => ({ db: {} }));
import {
  buildWarningRoleScreen,
  handleWarningSettings,
} from "../../../src/modules/settings/discord/warningSettings.js";
const config = { guildId: "guild" } as GuildConfig;
const update = vi.fn().mockImplementation(async (_id, data) => ({ ...config, ...data }));
function fixture(
  values = {
    numberedName: "Warning {count}",
    singleName: "Warned",
    color: "#ff0000",
    duration: "7d",
  },
) {
  const submit = {
    inCachedGuild: () => true,
    user: { id: "admin" },
    guildId: "guild",
    guild: { members: { fetch: vi.fn().mockResolvedValue({ permissions: { has: () => true } }) } },
    fields: { getTextInputValue: (key: keyof typeof values) => values[key] },
    deferReply: vi.fn(),
    editReply: vi.fn(),
  };
  const button = {
    customId: "setup:session:warning-edit",
    user: submit.user,
    guildId: "guild",
    isButton: () => true,
    showModal: vi.fn(),
    awaitModalSubmit: vi.fn().mockResolvedValue(submit),
    followUp: vi.fn(),
  };
  return { button, submit };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.verified.mockResolvedValue(true);
});
test("warning controls offer all modes, role styling and an optional shared role", () => {
  const view = buildWarningRoleScreen({} as never, config, "session");
  const rows = view.components!.map((row: any) => row.toJSON());
  expect(rows[0].components[0].options.map((option: any) => option.value)).toEqual([
    "numbered",
    "single",
    "none",
  ]);
  expect(rows[2].components[0]).toMatchObject({ min_values: 0, max_values: 1 });
  expect(rows.every((row: any) => row.components.length <= 5)).toBe(true);
});
test("modal saves names, color and expiration after refreshing authorization", async () => {
  const { button, submit } = fixture();
  await handleWarningSettings(button as never, config, "session", update);
  expect(update).toHaveBeenCalledWith("guild", {
    warningRoleSettings: expect.objectContaining({
      numberedName: "Warning {count}",
      singleName: "Warned",
      color: 0xff0000,
      defaultDurationMs: 7 * 86_400_000,
    }),
  });
  expect(submit.guild.members.fetch).toHaveBeenCalledWith({ user: "admin", force: true });
  expect(mocks.verified).toHaveBeenCalledWith(submit);
  const modal = button.showModal.mock.calls[0][0].toJSON();
  expect(modal.components.every((row: any) => row.components[0].label.length <= 45)).toBe(true);
});
test("reopening a long default duration produces an editable valid value", async () => {
  const { button } = fixture();
  button.awaitModalSubmit.mockResolvedValue(null);
  await handleWarningSettings(
    button as never,
    { ...config, warningRoleSettings: { defaultDurationMs: 28 * 86_400_000 } },
    "session",
    update,
  );
  const modal = button.showModal.mock.calls[0][0].toJSON();
  expect(modal.components[3].components[0].value).toBe("28d");
});
test("invalid colors, names or durations do not save", async () => {
  for (const override of [{ color: "invalid" }, { numberedName: "Warning" }, { duration: "29d" }]) {
    const { button, submit } = fixture({
      ...{
        numberedName: "warn{count}",
        singleName: "Warned",
        color: "Orange",
        duration: "permanent",
      },
      ...override,
    });
    await handleWarningSettings(button as never, config, "session", update);
    expect(submit.editReply).toHaveBeenCalledOnce();
  }
  expect(update).not.toHaveBeenCalled();
});
test("permission or ownership loss after opening the modal blocks changes", async () => {
  const f = fixture();
  f.submit.guild.members.fetch.mockResolvedValue({ permissions: { has: () => false } });
  await handleWarningSettings(f.button as never, config, "session", update);
  expect(f.submit.editReply).toHaveBeenCalledWith(expect.stringContaining("Manage Server"));
  mocks.verified.mockResolvedValue(false);
  await handleWarningSettings(fixture().button as never, config, "session", update);
  expect(update).not.toHaveBeenCalled();
});
