import { Command } from "@sapphire/framework";
import { InteractionContextType, MessageFlags, PermissionFlagsBits } from "discord.js";
import { logger } from "../../logger.js";
import { moderationCaseService } from "../../services/moderation/caseService.js";
import { buildCaseEmbed } from "../../services/moderation/renderer.js";
import { hasModeratorPermission, missingPermissionMessage, validateBotPermissions } from "../../services/moderation/permissionGuards.js";
import { toAuditLogReason } from "../../services/moderation/commandUtils.js";

const discordIdPattern = /^\d{17,20}$/;

export class UnbanCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("unban")
        .setDescription("Unban a user by ID")
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .setContexts(InteractionContextType.Guild)
        .addStringOption((option) => option.setName("user-id").setDescription("Discord user ID").setRequired(true))
        .addStringOption((option) => option.setName("reason").setDescription("Reason").setMaxLength(1_000).setRequired(true)),
    );
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: "This command can only be used inside a server.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!hasModeratorPermission(interaction.member, PermissionFlagsBits.BanMembers)) {
      await interaction.reply({ content: missingPermissionMessage("BanMembers"), flags: MessageFlags.Ephemeral });
      return;
    }
    const botValidation = validateBotPermissions(interaction.guild, [PermissionFlagsBits.BanMembers]);
    if (botValidation) {
      await interaction.reply({ content: botValidation, flags: MessageFlags.Ephemeral });
      return;
    }
    const userId = interaction.options.getString("user-id", true).trim();
    if (!discordIdPattern.test(userId)) {
      await interaction.reply({ content: "Please provide a valid Discord user ID.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const reason = interaction.options.getString("reason", true).trim();
    try {
      const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
      if (!ban) {
        await interaction.editReply({ content: "That user is not banned here." });
        return;
      }
      await interaction.guild.members.unban(userId, toAuditLogReason(reason));
      const moderationCase = await moderationCaseService.createCase({ guildId: interaction.guildId, targetUserId: userId, moderatorUserId: interaction.user.id, action: "UNBAN", reason });
      await interaction.editReply({ content: `Unban created - Case #${moderationCase.caseNumber}`, embeds: [buildCaseEmbed(moderationCase)] });
    } catch (error) {
      logger.error({ err: error, guildId: interaction.guildId, userId }, "Unban command failed");
      await interaction.editReply({ content: "I could not unban that user right now." });
    }
  }
}
