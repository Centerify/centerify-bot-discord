import { Command } from "@sapphire/framework";
import { ChannelType, InteractionContextType } from "discord.js";
import { runTicket } from "../runtime.js";

export class TicketCommand extends Command {
  override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("ticket")
        .setDescription("Open and manage private support tickets")
        .setContexts(InteractionContextType.Guild)
        .addSubcommand((sub) =>
          sub
            .setName("setup")
            .setDescription("Staff: configure tickets for this server")
            .addChannelOption((o) =>
              o
                .setName("category")
                .setDescription("Category for new private tickets")
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(true),
            )
            .addRoleOption((o) =>
              o
                .setName("support_role")
                .setDescription("Staff role allowed to access tickets")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("disable")
            .setDescription("Staff: stop new tickets and disable existing panels"),
        )
        .addSubcommand((sub) =>
          sub
            .setName("panel")
            .setDescription("Staff: publish a persistent open-ticket button")
            .addChannelOption((o) =>
              o
                .setName("channel")
                .setDescription("Where to send the ticket panel")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true),
            )
            .addStringOption((o) =>
              o.setName("message").setDescription("Panel message").setMaxLength(1800),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("open")
            .setDescription("Open your private support ticket")
            .addStringOption((o) =>
              o
                .setName("subject")
                .setDescription("Briefly describe what you need")
                .setMaxLength(1000),
            ),
        )
        .addSubcommand((sub) =>
          sub.setName("close").setDescription("Close this ticket and keep its message history"),
        )
        .addSubcommand((sub) =>
          sub
            .setName("add")
            .setDescription("Staff: allow a member into this open ticket")
            .addUserOption((o) =>
              o.setName("member").setDescription("Member to add").setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove")
            .setDescription("Staff: remove an extra member from this ticket")
            .addUserOption((o) =>
              o.setName("member").setDescription("Member to remove").setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("delete")
            .setDescription("Staff: permanently delete a closed ticket")
            .addBooleanOption((o) =>
              o
                .setName("confirm")
                .setDescription("Set true to confirm permanent deletion")
                .setRequired(true),
            ),
        ),
    );
  }

  override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    await runTicket(interaction);
  }
}
