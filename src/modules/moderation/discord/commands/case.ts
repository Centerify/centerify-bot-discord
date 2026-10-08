import { Command } from "@sapphire/framework";
import { InteractionContextType, MessageFlags, PermissionFlagsBits } from "discord.js";
import { logger } from "../../../../adapters/logging/runtime.js";
import { moderationCaseService } from "../services.js";
import { buildCaseEmbed } from "../renderer.js";
import { hasModeratorPermission, missingPermissionMessage } from "../permissionGuards.js";

export class CaseCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("case")
        .setDescription("Show a moderation case")
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setContexts(InteractionContextType.Guild)
        .addIntegerOption((option) => option.setName("case-number").setDescription("Case number").setMinValue(1).setRequired(true)),
    );
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: "This command can only be used inside a server.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!hasModeratorPermission(interaction.member, PermissionFlagsBits.ModerateMembers)) {
      await interaction.reply({ content: missingPermissionMessage("ModerateMembers"), flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const caseNumber = interaction.options.getInteger("case-number", true);
    try {
      const moderationCase = await moderationCaseService.findByCaseNumber(interaction.guildId, caseNumber);
      if (!moderationCase) {
        await interaction.editReply({ content: `Case #${caseNumber} was not found in this server.` });
        return;
      }
      await interaction.editReply({ embeds: [buildCaseEmbed(moderationCase)] });
    } catch (error) {
      logger.error({ err: error, guildId: interaction.guildId, caseNumber }, "Case command failed");
      await interaction.editReply({ content: "I could not load that case right now." });
    }
  }
}
