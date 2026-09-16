import { Command } from "@sapphire/framework";
import { InteractionContextType, MessageFlags, PermissionFlagsBits } from "discord.js";
import { logger } from "../../logger.js";
import { moderationCaseService } from "../../services/moderation/caseService.js";
import { buildCaseEmbed } from "../../services/moderation/renderer.js";
import { hasModeratorPermission, missingPermissionMessage, validateBotPermissions, validateMemberAction } from "../../services/moderation/permissionGuards.js";
import { dmUser, toAuditLogReason } from "../../services/moderation/commandUtils.js";

export class KickCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("kick")
        .setDescription("Kick a member")
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .setContexts(InteractionContextType.Guild)
        .addUserOption((option) => option.setName("user").setDescription("Member to kick").setRequired(true))
        .addStringOption((option) => option.setName("reason").setDescription("Reason").setMaxLength(1_000).setRequired(true)),
    );
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: "This command can only be used inside a server.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!hasModeratorPermission(interaction.member, PermissionFlagsBits.KickMembers)) {
      await interaction.reply({ content: missingPermissionMessage("KickMembers"), flags: MessageFlags.Ephemeral });
      return;
    }
    const botValidation = validateBotPermissions(interaction.guild, [PermissionFlagsBits.KickMembers]);
    if (botValidation) {
      await interaction.reply({ content: botValidation, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const user = interaction.options.getUser("user", true);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member || !member.kickable) {
      await interaction.editReply({ content: "I cannot kick that member." });
      return;
    }
    const validation = validateMemberAction({ guild: interaction.guild, moderator: interaction.member, target: member });
    if (validation) {
      await interaction.editReply({ content: validation });
      return;
    }
    const reason = interaction.options.getString("reason", true).trim();
    try {
      await dmUser(user, `You were kicked from ${interaction.guild.name}: ${reason}`, { guildId: interaction.guildId, userId: user.id });
      await member.kick(toAuditLogReason(reason));
      const moderationCase = await moderationCaseService.createCase({ guildId: interaction.guildId, targetUserId: user.id, moderatorUserId: interaction.user.id, action: "KICK", reason });
      await interaction.editReply({ content: `Kick created - Case #${moderationCase.caseNumber}`, embeds: [buildCaseEmbed(moderationCase)] });
    } catch (error) {
      logger.error({ err: error, guildId: interaction.guildId, userId: user.id }, "Kick command failed");
      await interaction.editReply({ content: "I could not kick that member right now." });
    }
  }
}
