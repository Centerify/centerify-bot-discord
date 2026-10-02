import { expect, test } from "vitest";
import { ComponentType, MessageFlags } from "discord.js";
import {
  customSettingsView,
  type CustomSettingsState,
} from "../../../src/services/customCommands/settingsView.js";
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
  expect(selects.map((item) => item.options.length)).toEqual([5, 3, 25]);
  expect(selects[0]!.options.find((item) => item.default)?.value).toBe("26");
  expect(selects[2]!.options.find((item) => item.default)?.value).toBe("27");
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
