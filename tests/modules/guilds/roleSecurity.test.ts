import { expect, test } from "vitest";
import { PermissionFlagsBits as P, PermissionsBitField } from "discord.js";
import { validateAssignableRole } from "../../../src/modules/guilds/discord/permissions.js";
import { privilegedRolePermissions } from "../../../src/modules/guilds/discord/rolePolicy.js";

function fixture(bits: bigint[] = []) {
  const guild = {
    id: "guild",
    ownerId: "owner",
    members: {
      me: {
        permissions: new PermissionsBitField([P.ManageRoles]),
        roles: { highest: { position: 100 } },
      },
    },
  };
  const role = {
    id: "role",
    guild,
    managed: false,
    permissions: new PermissionsBitField(bits),
    comparePositionTo: (other: { position: number }) => 10 - other.position,
  };
  const actor = { id: "manager", guild, roles: { highest: { position: 20 } } };
  return { guild, role, actor };
}

test.each(privilegedRolePermissions)(
  "automatic roles reject privileged permission %s even below the bot",
  (permission) => {
    const { guild, role, actor } = fixture([permission]);
    expect(validateAssignableRole(guild as never, role as never, actor as never)).toContain(
      "administrative",
    );
  },
);

test("ordinary roles work; foreign, managed, everyone and elevated hierarchy roles fail", () => {
  const { guild, role, actor } = fixture([P.ViewChannel, P.SendMessages]);
  const check = () => validateAssignableRole(guild as never, role as never, actor as never);
  expect(check()).toBeNull();
  actor.roles.highest.position = 10;
  expect(check()).toContain("highest role");
  actor.id = guild.ownerId;
  expect(check()).toBeNull();
  role.guild = { ...guild, id: "foreign" };
  expect(check()).toContain("another server");
  role.guild = guild;
  role.id = guild.id;
  expect(check()).toContain("everyone");
  role.id = "role";
  role.managed = true;
  expect(check()).toContain("Managed");
});
