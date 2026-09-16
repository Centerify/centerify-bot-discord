import { Command } from "@sapphire/framework";
import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../../logger.js";
import { moderationCaseService } from "../../services/moderation/caseService.js";
import { formatDuration, maxDiscordTimeoutMs, parseDuration } from "../../services/moderation/durationParser.js";
import { buildCaseEmbed } from "../../services/moderation/renderer.js";
import { hasModeratorPermission, missingPermissionMessage, validateBotPermissions, validateMemberAction } from "../../services/moderation/permissionGuards.js";
import { toAuditLogReason } from "../../services/moderation/commandUtils.js";

export class TimeoutCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("timeout")
        .setDescription("Timeout a member")
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setContexts(InteractionContextType.Guild)
        .addUserOption((option) => option.setName("user").setDescription("Member to timeout").setRequired(true))
        .addStringOption((option) => option.setName("duration").setDescription("Duration like 10m, 1h, 1d, 7d").setRequired(true))
        .addStringOption((option) => option.setName("reason").setDescription("Reason").setMaxLength(1_000).setRequired(true)),
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

    const botValidation = validateBotPermissions(interaction.guild, [PermissionFlagsBits.ModerateMembers]);
    if (botValidation) {
      await interaction.reply({ content: botValidation, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const user = interaction.options.getUser("user", true);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const durationMs = parseDuration(interaction.options.getString("duration", true));

    if (!member || !durationMs || durationMs > maxDiscordTimeoutMs) {
      await interaction.editReply({ content: "Choose a member and a duration from 1m through 28d." });
      return;
    }

    if (!member.moderatable) {
      await interaction.editReply({ content: "I cannot timeout that member." });
      return;
    }

    const validation = validateMemberAction({ guild: interaction.guild, moderator: interaction.member, target: member });
    if (validation) {
      await interaction.editReply({ content: validation });
      return;
    }

    const reason = interaction.options.getString("reason", true).trim();

    try {
      await member.timeout(durationMs, toAuditLogReason(reason));
      const moderationCase = await moderationCaseService.createCase({
        guildId: interaction.guildId,
        targetUserId: user.id,
        moderatorUserId: interaction.user.id,
        action: "TIMEOUT",
        reason,
        durationMs,
      });

      await interaction.editReply({
        content: `Timeout created - Case #${moderationCase.caseNumber} (${formatDuration(durationMs)})`,
        embeds: [buildCaseEmbed(moderationCase)],
      });
    } catch (error) {
      logger.error({ err: error, guildId: interaction.guildId, userId: user.id }, "Timeout command failed");
      await interaction.editReply({ content: "I could not timeout that member right now." });
    }
  }
}
