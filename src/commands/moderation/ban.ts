import { Command } from "@sapphire/framework";
import { InteractionContextType, MessageFlags, PermissionFlagsBits } from "discord.js";
import { logger } from "../../logger.js";
import { moderationCaseService } from "../../services/moderation/caseService.js";
import { buildCaseEmbed } from "../../services/moderation/renderer.js";
import { hasModeratorPermission, missingPermissionMessage, validateBotPermissions, validateMemberAction } from "../../services/moderation/permissionGuards.js";
import { dmUser, toAuditLogReason } from "../../services/moderation/commandUtils.js";

export class BanCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("ban")
        .setDescription("Ban a user")
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .setContexts(InteractionContextType.Guild)
        .addUserOption((option) => option.setName("user").setDescription("User to ban").setRequired(true))
        .addStringOption((option) => option.setName("reason").setDescription("Reason").setMaxLength(1_000).setRequired(true))
        .addIntegerOption((option) => option.setName("delete-days").setDescription("Delete recent message history, 0-7 days").setMinValue(0).setMaxValue(7).setRequired(false)),
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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const user = interaction.options.getUser("user", true);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) {
      const validation = validateMemberAction({ guild: interaction.guild, moderator: interaction.member, target: member });
      if (validation) {
        await interaction.editReply({ content: validation });
        return;
      }
      if (!member.bannable) {
        await interaction.editReply({ content: "I cannot ban that member." });
        return;
      }
    }
    const reason = interaction.options.getString("reason", true).trim();
    const deleteMessageSeconds = (interaction.options.getInteger("delete-days") ?? 0) * 24 * 60 * 60;
    try {
      await dmUser(user, `You were banned from ${interaction.guild.name}: ${reason}`, { guildId: interaction.guildId, userId: user.id });
      await interaction.guild.members.ban(user.id, {
        reason: toAuditLogReason(reason),
        deleteMessageSeconds,
      });
      const moderationCase = await moderationCaseService.createCase({ guildId: interaction.guildId, targetUserId: user.id, moderatorUserId: interaction.user.id, action: "BAN", reason, metadata: { deleteMessageSeconds } });
      await interaction.editReply({ content: `Ban created - Case #${moderationCase.caseNumber}`, embeds: [buildCaseEmbed(moderationCase)] });
    } catch (error) {
      logger.error({ err: error, guildId: interaction.guildId, userId: user.id }, "Ban command failed");
      await interaction.editReply({ content: "I could not ban that user right now." });
    }
  }
}
