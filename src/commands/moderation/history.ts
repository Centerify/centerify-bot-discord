import { Command } from "@sapphire/framework";
import { Colors, EmbedBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits } from "discord.js";
import { logger } from "../../logger.js";
import { moderationCaseService } from "../../services/moderation/caseService.js";
import { formatDetailedCaseField } from "../../services/moderation/renderer.js";
import { hasModeratorPermission, missingPermissionMessage } from "../../services/moderation/permissionGuards.js";

export class HistoryCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("history")
        .setDescription("Show recent moderation history for a user")
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setContexts(InteractionContextType.Guild)
        .addUserOption((option) => option.setName("user").setDescription("User to inspect").setRequired(true)),
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
      const [cases, totalCases, activeWarnings] = await Promise.all([
        moderationCaseService.recentForUser(interaction.guildId, user.id, 10),
        moderationCaseService.countForUser(interaction.guildId, user.id),
        moderationCaseService.countWarningsForUser(interaction.guildId, user.id),
      ]);
      const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle(`Moderation History - ${user.tag}`)
        .setThumbnail(user.displayAvatarURL())
        .setDescription(
          `Complete moderation overview for <@${user.id}>\n` +
            `**Total cases:** ${totalCases} • **Active warnings:** ${activeWarnings}`,
        )
        .setFooter({
          text: `Showing ${cases.length} of ${totalCases} cases • Timed warnings stop counting after expiry`,
        })
        .setTimestamp();

      if (cases.length > 0) {
        embed.addFields(cases.map((moderationCase) => formatDetailedCaseField(moderationCase)));
      } else {
        embed.addFields({
          name: "No history",
          value: "No moderation cases have been recorded for this user.",
        });
      }

      await interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      logger.error({ err: error, guildId: interaction.guildId, userId: user.id }, "History command failed");
      await interaction.editReply({ content: "I could not load moderation history right now." });
    }
  }
}
