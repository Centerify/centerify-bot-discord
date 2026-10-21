import { expect, test } from "vitest";
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { RoleCommand } from "../../../src/modules/management/discord/commands/role.js";
import type { Command } from "@sapphire/framework";

test("role management is restricted and exposes no role-position override", () => {
  const builder = new SlashCommandBuilder();
  RoleCommand.prototype.registerApplicationCommands({
    registerChatInputCommand: (build: (b: SlashCommandBuilder) => void) => build(builder),
  } as Command.Registry);
  const data = builder.toJSON();
  expect(data.default_member_permissions).toBe(PermissionFlagsBits.ManageRoles.toString());
  expect(JSON.stringify(data)).not.toContain('"position"');
});
