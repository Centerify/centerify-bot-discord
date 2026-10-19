import { expect, test } from "vitest";
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { ChannelCommand } from "../../../src/modules/management/discord/commands/channel.js";
import type { Command } from "@sapphire/framework";

test("channel registration restricts management and requires deletion confirmation", () => {
  const builder = new SlashCommandBuilder();
  ChannelCommand.prototype.registerApplicationCommands({
    registerChatInputCommand: (build: (b: SlashCommandBuilder) => void) => build(builder),
  } as Command.Registry);
  const data = builder.toJSON();
  expect(data.default_member_permissions).toBe(PermissionFlagsBits.ManageChannels.toString());
  expect(data.options?.find((option) => option.name === "delete")).toMatchObject({
    options: expect.arrayContaining([
      expect.objectContaining({
        name: "confirm",
        type: 5,
        description: expect.any(String),
        required: true,
      }),
    ]),
  });
});
