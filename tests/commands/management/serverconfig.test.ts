import { expect, test } from "vitest";
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { ServerConfigCommand } from "../../../src/modules/management/discord/commands/serverconfig.js";
import type { Command } from "@sapphire/framework";

test("server configuration requires Manage Server and cannot change ownership", () => {
  const builder = new SlashCommandBuilder();
  ServerConfigCommand.prototype.registerApplicationCommands({
    registerChatInputCommand: (build: (b: SlashCommandBuilder) => void) => build(builder),
  } as Command.Registry);
  const data = builder.toJSON();
  expect(data.default_member_permissions).toBe(PermissionFlagsBits.ManageGuild.toString());
  expect(data.options?.map((option) => option.name)).not.toContain("owner");
});
