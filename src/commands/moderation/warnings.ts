import { Command } from "@sapphire/framework";
import {
  Colors,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../../logger.js";
import { moderationCaseService } from "../../services/moderation/caseService.js";
import { formatCaseLine } from "../../services/moderation/renderer.js";
import { hasModeratorPermission, missingPermissionMessage } from "../../services/moderation/permissionGuards.js";

export class WarningsCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("warnings")
        .setDescription("Show recent warnings for a member")
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setContexts(InteractionContextType.Guild)
        .addUserOption((option) =>
          option.setName("user").setDescription("Member to inspect").setRequired(true),
        ),
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

    const user = interaction.options.getUser("user", true);
    try {
      const warnings = await moderationCaseService.recentWarningsForUser(interaction.guildId, user.id, 10);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Yellow)
            .setTitle(`Recent Warnings - ${user.tag}`)
            .setDescription(warnings.length > 0 ? warnings.map(formatCaseLine).join("\n") : "No warnings found.")
            .setTimestamp(),
        ],
      });
    } catch (error) {
      logger.error({ err: error, guildId: interaction.guildId, userId: user.id }, "Warnings command failed");
      await interaction.editReply({ content: "I could not load warnings right now." });
    }
  }
}
