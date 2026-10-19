import { beforeEach, expect, test, vi } from "vitest";
import { Collection, PermissionsBitField, PermissionFlagsBits } from "discord.js";
import { warningRoleSettings } from "../../../src/modules/guilds/index.js";
const mocks = vi.hoisted(() => ({ load: vi.fn(), active: vi.fn(), verified: vi.fn() }));
vi.mock("../../../src/modules/guilds/discord/config.js", () => ({
  guildConfigService: { getOrCreate: mocks.load },
}));
vi.mock("../../../src/modules/guilds/discord/ownership.js", () => ({
  guildOwnershipService: { isVerified: mocks.verified },
}));
vi.mock("../../../src/modules/moderation/discord/services.js", () => ({
  moderationCaseService: { activeWarningsForUser: mocks.active },
}));
vi.mock("../../../src/adapters/logging/runtime.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));
import {
  applyWarningRoleStyle,
  getOrCreateWarnRole,
} from "../../../src/modules/moderation/discord/warningRoleSettings.js";
import { createWarningRoleLifecycle } from "../../../src/modules/moderation/discord/warningRoles.js";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.verified.mockResolvedValue(true);
});
function guildFixture() {
  return {
    id: "guild",
    roles: {
      fetch: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: "new" }),
      cache: new Collection<string, any>(),
    },
  };
}
test("no-role mode makes no Discord role calls", async () => {
  const guild = guildFixture();
  expect(
    await getOrCreateWarnRole(guild as never, 2, warningRoleSettings({ mode: "none" })),
  ).toBeNull();
  expect(guild.roles.fetch).not.toHaveBeenCalled();
  expect(guild.roles.create).not.toHaveBeenCalled();
});
test("numbered roles use the count template and configured style", async () => {
  const guild = guildFixture();
  await getOrCreateWarnRole(
    guild as never,
    3,
    warningRoleSettings({ numberedName: "Warning {count}", color: 0xff0000, hoist: true }),
  );
  expect(guild.roles.create).toHaveBeenCalledWith(
    expect.objectContaining({ name: "Warning 3", colors: { primaryColor: 0xff0000 }, hoist: true }),
  );
});
test("shared roles reuse the same role regardless of warning count", async () => {
  const guild = guildFixture();
  const role = {
    id: "shared",
    name: "Warned",
    managed: false,
    permissions: new PermissionsBitField(),
  };
  guild.roles.cache.set(role.id, role);
  for (const count of [1, 3])
    expect(
      await getOrCreateWarnRole(guild as never, count, warningRoleSettings({ mode: "single" })),
    ).toBe(role);
  expect(guild.roles.create).not.toHaveBeenCalled();
});
test("a selected shared role is fetched by ID and deletion does not silently create another", async () => {
  const guild = guildFixture();
  guild.roles.fetch.mockResolvedValue({
    id: "123456789012345678",
    permissions: new PermissionsBitField(),
  });
  const settings = warningRoleSettings({ mode: "single", singleRoleId: "123456789012345678" });
  await getOrCreateWarnRole(guild as never, 3, settings);
  expect(guild.roles.fetch).toHaveBeenCalledWith(settings.singleRoleId, { force: true });
  guild.roles.fetch.mockResolvedValue(null);
  await expect(getOrCreateWarnRole(guild as never, 3, settings)).rejects.toThrow(
    "no longer exists",
  );
  expect(guild.roles.create).not.toHaveBeenCalled();
});
test("existing role style changes are applied without renaming or changing permissions", async () => {
  const role = { color: 0, hoist: false, mentionable: false, edit: vi.fn() };
  await applyWarningRoleStyle(
    role as never,
    warningRoleSettings({ color: 0xff0000, mentionable: true }),
  );
  expect(role.edit).toHaveBeenCalledWith({
    colors: { primaryColor: 0xff0000 },
    hoist: false,
    mentionable: true,
    reason: expect.any(String),
  });
});

test("warning role name collisions and later permission changes never grant administrator", async () => {
  const guild = guildFixture();
  const role = {
    id: "existing",
    name: "Warned",
    managed: false,
    permissions: new PermissionsBitField([PermissionFlagsBits.Administrator]),
  };
  guild.roles.cache.set(role.id, role);
  await expect(
    getOrCreateWarnRole(guild as never, 1, warningRoleSettings({ mode: "single" })),
  ).rejects.toThrow("administrative");
  guild.roles.fetch.mockResolvedValue(role);
  await expect(
    getOrCreateWarnRole(
      guild as never,
      1,
      warningRoleSettings({ mode: "single", singleRoleId: "123456789012345678" }),
    ),
  ).rejects.toThrow("administrative");
  expect(guild.roles.create).not.toHaveBeenCalled();
});
test("shared warning role is retained until the last warning using it is removed", async () => {
  const lifecycle = createWarningRoleLifecycle();
  const member = { roles: { cache: new Map([["shared", {}]]), remove: vi.fn() } };
  const client = {
    guilds: {
      fetch: vi.fn().mockResolvedValue({ members: { fetch: vi.fn().mockResolvedValue(member) } }),
    },
  };
  const warning = {
    guildId: "guild",
    caseNumber: 1,
    targetUserId: "member",
    action: "WARNING",
    durationMs: null,
    createdAt: "2026-01-01",
    metadata: { warningRoleId: "shared" },
  };
  mocks.active.mockResolvedValue([{ ...warning, caseNumber: 2 }]);
  expect(await lifecycle.removeWarningRoleIfUnused(client as never, warning, "revoked")).toBe(
    "retained",
  );
  expect(member.roles.remove).not.toHaveBeenCalled();
  mocks.active.mockResolvedValue([{ ...warning, metadata: { warningRoleId: "other" } }]);
  expect(await lifecycle.removeWarningRoleIfUnused(client as never, warning, "revoked")).toBe(
    "removed",
  );
  expect(member.roles.remove).toHaveBeenCalledWith("shared", "revoked");
  expect(
    await lifecycle.removeWarningRoleIfUnused(
      client as never,
      { ...warning, metadata: { warningRoleId: null } },
      "revoked",
    ),
  ).toBe("not-assigned");
  lifecycle.stop();
});
