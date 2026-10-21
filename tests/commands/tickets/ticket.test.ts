import { expect, test } from "vitest";
import { SlashCommandBuilder, InteractionContextType } from "discord.js";
import { TicketCommand } from "../../../src/modules/tickets/discord/commands/ticket.js";
import type { Command } from "@sapphire/framework";

test("tickets remain accessible to ordinary server members", () => {
  const builder = new SlashCommandBuilder();
  TicketCommand.prototype.registerApplicationCommands({
    registerChatInputCommand: (build: (b: SlashCommandBuilder) => void) => build(builder),
  } as Command.Registry);
  const data = builder.toJSON();
  expect(data.default_member_permissions).toBeUndefined();
  expect(data.contexts).toEqual([InteractionContextType.Guild]);
  expect(data.options?.map((option) => option.name)).toContain("open");
});
