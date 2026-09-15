import { Command } from "@sapphire/framework";
import { InteractionContextType, MessageFlags, PermissionFlagsBits } from "discord.js";
import { logger } from "../../logger.js";
import { hasModeratorPermission, missingPermissionMessage, validateBotPermissions } from "../../services/moderation/permissionGuards.js";

export class PurgeCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("purge")
        .setDescription("Bulk delete recent messages")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setContexts(InteractionContextType.Guild)
        .addIntegerOption((option) => option.setName("amount").setDescription("Number of messages to delete").setMinValue(1).setMaxValue(100).setRequired(true)),
    );
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild() || !interaction.channel?.isTextBased()) {
      await interaction.reply({ content: "This command can only be used in a server text channel.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!hasModeratorPermission(interaction.member, PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({ content: missingPermissionMessage("ManageMessages"), flags: MessageFlags.Ephemeral });
      return;
    }
    const botValidation = validateBotPermissions(interaction.guild, [PermissionFlagsBits.ManageMessages]);
    if (botValidation) {
      await interaction.reply({ content: botValidation, flags: MessageFlags.Ephemeral });
      return;
    }
    if (!("bulkDelete" in interaction.channel)) {
      await interaction.reply({ content: "I cannot bulk delete messages in this channel.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const amount = interaction.options.getInteger("amount", true);
    try {
      const deleted = await interaction.channel.bulkDelete(amount, true);
      await interaction.editReply({ content: `Deleted ${deleted.size} message${deleted.size === 1 ? "" : "s"}.` });
    } catch (error) {
      logger.error({ err: error, guildId: interaction.guildId, channelId: interaction.channelId }, "Purge command failed");
      await interaction.editReply({ content: "I could not delete those messages right now." });
    }
  }
}
