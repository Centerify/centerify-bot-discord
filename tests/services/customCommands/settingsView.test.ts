import { expect, test } from "vitest";
import { ComponentType, MessageFlags } from "discord.js";
import {
  customSettingsView,
  customSettingsWarning,
  type CustomSettingsState,
} from "../../../src/modules/custom-commands/discord/settingsView.js";
import { record } from "./fixtures.js";
function state(): CustomSettingsState {
  return {
    commands: Array.from({ length: 30 }, (_, id) =>
      record({ id, name: `command-${id}` }),
    ),
    commandId: 26,
    commandPage: 1,
    scope: "selected",
    choices: Array.from({ length: 60 }, (_, id) => ({
      id: String(id),
      name: `Server ${id}`,
    })),
    selected: new Set(["1", "27"]),
    serverPage: 1,
  };
}
test("settings uses a valid V2 container with paginated command, scope, and server dropdowns", () => {
  const view = customSettingsView(state(), "session");
  expect(view.flags).toBe(MessageFlags.IsComponentsV2);
  expect(view).not.toHaveProperty("content");
  expect(view).not.toHaveProperty("embeds");
  const container = view.components[0].toJSON();
  expect(container.type).toBe(ComponentType.Container);
  const rows = container.components.filter(
    (item) => item.type === ComponentType.ActionRow,
  );
  const selects = rows.flatMap((row) =>
    row.components.filter((item) => item.type === ComponentType.StringSelect),
  );
  expect(selects.map((item) => item.options.length)).toEqual([5, 5, 3, 25]);
  expect(selects[0]!.options.find((item) => item.default)?.value).toBe("26");
  expect(selects[3]!.options.find((item) => item.default)?.value).toBe("27");
  expect(rows.every((row) => row.components.length <= 5)).toBe(true);
});
test("expired or closed V2 sessions keep their content and disable every control", () => {
  const container = customSettingsView(
    state(),
    "session",
    true,
  ).components[0].toJSON();
  const controls = container.components.flatMap((item) =>
    item.type === ComponentType.ActionRow ? item.components : [],
  );
  expect(controls.length).toBeGreaterThan(0);
  expect(controls.every((item) => "disabled" in item && item.disabled)).toBe(
    true,
  );
  expect(
    container.components.some(
      (item) => item.type === ComponentType.TextDisplay,
    ),
  ).toBe(true);
});
test("no commands or eligible servers still produce valid V2 settings", () => {
  const empty = state();
  empty.commands = [];
  expect(() =>
    customSettingsView(empty, "session").components[0].toJSON(),
  ).not.toThrow();
  const noServers = state();
  noServers.choices = [];
  expect(() =>
    customSettingsView(noServers, "session").components[0].toJSON(),
  ).not.toThrow();
});

test("separate warning embeds escape server names and suppress mentions", () => {
  const warning = state();
  warning.confirmation = {
    id: "nonce",
    fingerprint: "confirmation",
    conflicts: Array.from({ length: 100 }, (_, index) => ({
      guildId: String(index),
      guildName: "**Untrusted**\n@everyone",
      names: ["welcome", "hi"],
    })),
  };
  const view = customSettingsWarning(warning, "session");
  expect(view.flags).toBe(MessageFlags.Ephemeral);
  expect(view.allowedMentions).toEqual({ parse: [] });
  expect(view.embeds[0]!.toJSON().description).toContain(
    "\\*\\*Untrusted\\*\\* @everyone",
  );
  expect(view.embeds[0]!.toJSON().description).toContain("92 more servers");
  expect(
    view.components[0]!.toJSON().components.map((c) =>
      "custom_id" in c ? c.custom_id : undefined,
    ),
  ).toEqual([
    "cc-settings:session:proceed-nonce",
    "cc-settings:session:replace-nonce",
    "cc-settings:session:cancel-nonce",
  ]);
  expect(JSON.stringify(customSettingsView(warning, "session"))).not.toContain(
    "Duplicate commands found",
  );
});

test("batch selection keeps the independent customization selector available", () => {
  const batch = state();
  batch.commandIds = new Set([26, 27]);
  batch.dirty = true;
  const controls = customSettingsView(batch, "session")
    .components[0].toJSON()
    .components.flatMap((item) =>
      item.type === ComponentType.ActionRow ? item.components : [],
    );
  const select = controls.find(
    (item) =>
      item.type === ComponentType.StringSelect &&
      item.custom_id.endsWith(":command"),
  );
  expect(select).toMatchObject({ min_values: 0, max_values: 5 });
  if (select?.type !== ComponentType.StringSelect)
    throw new Error("Missing command input");
  expect(
    select.options.filter((item) => item.default).map((item) => item.value),
  ).toEqual(["26", "27"]);
  expect(
    controls.find(
      (item) => "custom_id" in item && item.custom_id.endsWith(":customize"),
    ),
  ).toMatchObject({ disabled: false });
});
