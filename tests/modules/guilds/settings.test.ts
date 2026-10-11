import { expect, test } from "vitest";
import { commandRoleAccess, commandRoleDenial, warningRoleSettings } from "../../../src/modules/guilds/domain/settings.js";

const allowed = "123456789012345678", denied = "223456789012345678";

test("existing servers retain numbered permanent warnings and unrestricted command access", () => {
  expect(warningRoleSettings(null)).toMatchObject({ mode: "numbered", numberedName: "warn{count}", color: 0, defaultDurationMs: null });
  expect(commandRoleDenial(null, "warn", new Set())).toBeNull();
});

test("allowed roles restrict access and denied roles take priority", () => {
  const access = { warn: { allowedRoleIds: [allowed], deniedRoleIds: [denied] } };
  expect(commandRoleDenial(access, "warn", new Set())).toContain("allowed roles");
  expect(commandRoleDenial(access, "warn", new Set([allowed]))).toBeNull();
  expect(commandRoleDenial(access, "warn", new Set([allowed, denied]))).toContain("denied");
  expect(commandRoleDenial(access, "ping", new Set())).toBeNull();
  expect(commandRoleDenial({ warn: { deniedRoleIds: [denied] } }, "warn", new Set([allowed]))).toBeNull();
});

test("recovery commands cannot be restricted and invalid role lists are rejected", () => {
  for (const name of ["settings", "setup", "verify", "unverify"])
    expect(() => commandRoleAccess({ [name]: { allowedRoleIds: [allowed] } })).toThrow();
  for (const roles of [["bad"], [allowed, allowed], Array(26).fill(allowed)])
    expect(() => commandRoleAccess({ warn: { allowedRoleIds: roles } })).toThrow();
});

test("warning settings validate names, modes, colors and expiration bounds", () => {
  expect(warningRoleSettings({ mode: "single", singleName: "Warned", singleRoleId: allowed, color: 0xff0000, defaultDurationMs: 86_400_000 })).toMatchObject({ mode: "single", color: 0xff0000 });
  for (const input of [{ mode: "invalid" }, { numberedName: "warn" }, { numberedName: "{count}{count}" },
    { color: -1 }, { color: 0x1000000 }, { hoist: "yes" }, { defaultDurationMs: 1 }, { defaultDurationMs: 29 * 86_400_000 }])
    expect(() => warningRoleSettings(input)).toThrow();
});
