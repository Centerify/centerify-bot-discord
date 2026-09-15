import { Command } from "@sapphire/framework";
import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type Role,
} from "discord.js";
import { logger } from "../../logger.js";
import { moderationCaseService } from "../../services/moderation/caseService.js";
import {
  formatDuration,
  maxDiscordTimeoutMs,
  parseDuration,
} from "../../services/moderation/durationParser.js";
import { buildCaseEmbed } from "../../services/moderation/renderer.js";
import {
  hasModeratorPermission,
  missingPermissionMessage,
  validateBotPermissions,
  validateMemberAction,
} from "../../services/moderation/permissionGuards.js";
import { dmUser } from "../../services/moderation/commandUtils.js";

export class WarnCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("warn")
        .setDescription("Create a warning for a member")
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setContexts(InteractionContextType.Guild)
        .addUserOption((option) =>
          option.setName("user").setDescription("Member to warn").setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for the warning")
            .setMaxLength(1_000)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("duration")
            .setDescription("Optional duration like 10m, 1h, 1d, 7d")
            .setRequired(false),
        ),
    );
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: "This command can only be used inside a server.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (!hasModeratorPermission(interaction.member, PermissionFlagsBits.ModerateMembers)) {
      await interaction.reply({ content: missingPermissionMessage("ModerateMembers"), flags: MessageFlags.Ephemeral });
      return;
    }

    const durationInput = interaction.options.getString("duration");
    const durationMs = durationInput ? parseDuration(durationInput) : null;
    if (durationInput && (!durationMs || durationMs > maxDiscordTimeoutMs)) {
      await interaction.reply({
        content: "Use a duration from 1m through 28d, like `10m`, `1h`, or `7d`.",
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
      await interaction.editReply({ content: "Please choose a server member who can be warned." });
      return;
    }

    const validation = validateMemberAction({ guild: interaction.guild, moderator: interaction.member, target: member });
    if (validation) {
      await interaction.editReply({ content: validation });
      return;
    }

    const reason = interaction.options.getString("reason", true).trim();

    try {
      const warnCount =
        (await moderationCaseService.countWarningsForUser(
          interaction.guildId,
          user.id,
        )) + 1;
      const role = await getOrCreateWarnRole(interaction.guild, warnCount);
      const roleValidation = validateWarningRole(interaction, role);
      if (roleValidation) {
        await interaction.editReply({
          content: `I could not assign ${role.name}: ${roleValidation}`,
        });
        return;
      }

      const moderationCase = await moderationCaseService.createCase({
        guildId: interaction.guildId,
        targetUserId: user.id,
        moderatorUserId: interaction.user.id,
        action: "WARNING",
        reason,
        durationMs,
        metadata: { warningRoleId: role.id, warningCount: warnCount },
      });

      await member.roles.add(role.id, reason);

      const durationText = durationMs ? ` for ${formatDuration(durationMs)}` : "";
      await dmUser(user, `You were warned in ${interaction.guild.name}${durationText} and received ${role.name}: ${reason}`, {
        guildId: interaction.guildId,
        userId: user.id,
        caseNumber: moderationCase.caseNumber,
      });

      if (durationMs) {
        scheduleWarningRoleRemoval(
          interaction.client,
          interaction.guildId,
          user.id,
          role.id,
          durationMs,
          reason,
        );
      }

      await interaction.editReply({
        content: `Warning created - Case #${moderationCase.caseNumber}; assigned ${role.name}`,
        embeds: [buildCaseEmbed(moderationCase)],
      });
    } catch (error) {
      logger.error({ err: error, guildId: interaction.guildId }, "Warn command failed");
      await interaction.editReply({ content: "I could not create that warning right now." });
    }
  }
}

async function getOrCreateWarnRole(guild: Guild, warnCount: number) {
  const roleName = getWarnRoleName(warnCount);
  const existingRole = guild.roles.cache.find((role) => role.name === roleName);
  if (existingRole) {
    return existingRole;
  }

  return guild.roles.create({
    name: roleName,
    reason: `Created role for warning count ${warnCount}`,
  });
}

export function getWarnRoleName(warnCount: number) {
  return `warn${warnCount}`;
}

function validateWarningRole(
  interaction: Command.ChatInputCommandInteraction<"cached">,
  role: Role,
) {
  if (role.id === interaction.guildId) {
    return "I cannot assign the everyone role.";
  }

  if (role.managed) {
    return "I cannot assign that managed role.";
  }

  if (
    interaction.member.id !== interaction.guild.ownerId &&
    role.comparePositionTo(interaction.member.roles.highest) >= 0
  ) {
    return "That role is not below your highest role.";
  }

  if (!role.editable) {
    return "That role is not below my highest role.";
  }

  return null;
}

function scheduleWarningRoleRemoval(
  client: Client,
  guildId: string,
  userId: string,
  roleId: string,
  durationMs: number,
  reason: string,
) {
  setTimeout(async () => {
    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId);
      await member.roles.remove(roleId, `Warning duration expired: ${reason}`);
    } catch (error) {
      logger.warn({ err: error, guildId, userId, roleId }, "Failed to remove warning role");
    }
  }, durationMs);
}
