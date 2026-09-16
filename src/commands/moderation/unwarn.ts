import { Command } from "@sapphire/framework";
import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../../logger.js";
import {
  dmUser,
  toAuditLogReason,
} from "../../services/moderation/commandUtils.js";
import { moderationCaseService } from "../../services/moderation/caseService.js";
import {
  hasModeratorPermission,
  missingPermissionMessage,
  validateBotPermissions,
  validateMemberAction,
} from "../../services/moderation/permissionGuards.js";
import { buildCaseEmbed } from "../../services/moderation/renderer.js";
import {
  cancelWarningRoleRemoval,
  removeWarningRoleIfUnused,
  type WarningRoleRemovalResult,
} from "../../services/moderation/warningRoles.js";

export class UnwarnCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("unwarn")
        .setDescription("Remove an active warning from a member")
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setContexts(InteractionContextType.Guild)
        .addUserOption((option) =>
          option.setName("user").setDescription("Member to unwarn").setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for removing the warning")
            .setMaxLength(1_000)
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("case-number")
            .setDescription("Specific active warning case; defaults to the newest")
            .setMinValue(1)
            .setRequired(false),
        ),
    );
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: "This command can only be used inside a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!hasModeratorPermission(interaction.member, PermissionFlagsBits.ModerateMembers)) {
      await interaction.reply({
        content: missingPermissionMessage("ModerateMembers"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const botValidation = validateBotPermissions(interaction.guild, [
      PermissionFlagsBits.ManageRoles,
    ]);
    if (botValidation) {
      await interaction.reply({ content: botValidation, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const user = interaction.options.getUser("user", true);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member || user.bot || user.system) {
      await interaction.editReply({
        content: "Please choose a server member whose warning can be removed.",
      });
      return;
    }

    const validation = validateMemberAction({
      guild: interaction.guild,
      moderator: interaction.member,
      target: member,
    });
    if (validation) {
      await interaction.editReply({ content: validation });
      return;
    }

    const reason = interaction.options.getString("reason", true).trim();
    const caseNumber = interaction.options.getInteger("case-number");

    try {
      const warning = await moderationCaseService.revokeActiveWarning({
        guildId: interaction.guildId,
        targetUserId: user.id,
        moderatorUserId: interaction.user.id,
        reason,
        caseNumber,
      });
      if (!warning) {
        await interaction.editReply({
          content: caseNumber
            ? `Case #${caseNumber} is not an active warning for that member.`
            : "That member has no active warnings.",
        });
        return;
      }

      cancelWarningRoleRemoval(warning);
      const roleResult = await removeWarningRoleIfUnused(
        interaction.client,
        warning,
        toAuditLogReason(`Warning #${warning.caseNumber} revoked: ${reason}`),
      );
      const remainingWarnings = await moderationCaseService.countWarningsForUser(
        interaction.guildId,
        user.id,
      );

      await dmUser(
        user,
        [
          `A warning was removed from you in ${interaction.guild.name}.`,
          `Case: #${warning.caseNumber}`,
          `Removed by: ${interaction.user.tag}`,
          `Reason: ${reason}`,
          `Active warnings remaining: ${remainingWarnings}`,
        ].join("\n"),
        {
          guildId: interaction.guildId,
          userId: user.id,
          caseNumber: warning.caseNumber,
          action: "unwarn",
        },
      );

      await interaction.editReply({
        content:
          `Warning #${warning.caseNumber} removed; ${remainingWarnings} active warning` +
          `${remainingWarnings === 1 ? "" : "s"} remain. ${roleResultMessage(roleResult)}`,
        embeds: [buildCaseEmbed(warning)],
      });
    } catch (error) {
      logger.error(
        { err: error, guildId: interaction.guildId, userId: user.id },
        "Unwarn command failed",
      );
      await interaction.editReply({ content: "I could not remove that warning right now." });
    }
  }
}

function roleResultMessage(result: WarningRoleRemovalResult) {
  switch (result) {
    case "removed":
      return "The warning role was removed.";
    case "retained":
      return "The role was kept because another active warning still uses it.";
    case "failed":
      return "The warning was revoked, but I could not remove its role.";
    case "not-assigned":
      return "No associated warning role was assigned.";
  }
}
