import type { Command } from "@sapphire/framework";
import {
  MessageFlags,
  PermissionFlagsBits,
  TimestampStyles,
  time,
  type Guild,
  type Role,
} from "discord.js";
import { logger } from "../../../adapters/logging/runtime.js";
import {
  formatDuration,
  maxDiscordTimeoutMs,
  parseDuration,
} from "./durationParser.js";
import { buildCaseEmbed } from "./renderer.js";
import {
  hasModeratorPermission,
  missingPermissionMessage,
  validateBotPermissions,
  validateMemberAction,
} from "./permissionGuards.js";
import {
  dmUser,
  toAuditLogReason,
} from "./commandUtils.js";
import { getWarningExpiresAt } from "../domain/warningLifecycle.js";
import {
  getWarnRoleName,
  scheduleWarningRoleRemoval,
} from "./warningRoles.js";
import {
  getGlobalModerationTargets,
  globalModeration,
  globalModerationDisabledMessage,
} from "./globalModeration.js";

import type { WarnMember } from "../application/WarnMember.js";

export async function runWarn(
  interaction: Command.ChatInputCommandInteraction,
  warnMember: Pick<WarnMember, keyof WarnMember>,
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
  if (!reason) {
    await interaction.editReply({ content: "The reason cannot be empty." });
    return;
  }
  const isGlobal = interaction.options.getBoolean("global") ?? false;

  try {
    if (isGlobal) {
      const targets = await getGlobalModerationTargets(
        interaction.client,
        interaction.guildId,
        "warn",
      );
      if (!targets.enabled) {
        await interaction.editReply({ content: globalModerationDisabledMessage() });
        return;
      }

      const { cases: successfulCases, skippedGuildIds } = await globalModeration.apply({
        guildIds: targets.guilds.map((guild) => guild.id), targetUserId: user.id, action: "warn",
      }, async (guildId) => {
        const guild = targets.guilds.find((entry) => entry.id === guildId)!;
          if (validateBotPermissions(guild, [PermissionFlagsBits.ManageRoles])) {
            return null;
          }

          const targetMember = await guild.members.fetch(user.id).catch(() => null);
          if (!targetMember || !targetMember.manageable) {
            return null;
          }

          const result = await warnMember.execute({
            guildId: guild.id, targetUserId: user.id, moderatorUserId: interaction.user.id,
            reason, durationMs, originGuildId: interaction.guildId,
          }, {
            async prepareRole(_, count) {
              const role = await getOrCreateWarnRole(guild, count);
              return { id: role.id, name: role.name, error: guild.id === interaction.guildId
                ? validateWarningRole(interaction, role) : validateGlobalWarningRole(guild, role) };
            },
            async assignRole(_, roleId) { await targetMember.roles.add(roleId, toAuditLogReason(`Global warning: ${reason}`)); },
          });
          if (result.status === "rejected") return null;
          const { moderationCase } = result;
          if (durationMs) {
            scheduleWarningRoleRemoval(interaction.client, moderationCase);
          }
        return moderationCase;
      });
      const skippedGuilds = skippedGuildIds.length;

      const localCase = successfulCases.find(
        (moderationCase) => moderationCase.guildId === interaction.guildId,
      );
      if (localCase) {
        await dmUser(
          user,
          [
            `You received a global warning from ${interaction.guild.name}.`,
            `Case in that server: #${localCase.caseNumber}`,
            `Issued by: ${interaction.user.tag}`,
            `Duration: ${durationMs ? formatDuration(durationMs) : "Permanent"}`,
            `Reason: ${reason}`,
          ].join("\n"),
          {
            guildId: interaction.guildId,
            userId: user.id,
            caseNumber: localCase.caseNumber,
            action: "global-warn",
          },
        );
      }

      await interaction.editReply({
        content:
          `Global warning applied in ${successfulCases.length}/${targets.guilds.length} enabled servers.` +
          (skippedGuilds > 0 ? ` Skipped ${skippedGuilds} unavailable servers.` : ""),
        embeds: localCase ? [buildCaseEmbed(localCase)] : [],
      });
      return;
    }

    const result = await warnMember.execute({
      guildId: interaction.guildId, targetUserId: user.id, moderatorUserId: interaction.user.id, reason, durationMs,
    }, {
      async prepareRole(_, count) {
        const role = await getOrCreateWarnRole(interaction.guild, count);
        return { id: role.id, name: role.name, error: validateWarningRole(interaction, role) };
      },
      async assignRole(_, roleId) { await member.roles.add(roleId, toAuditLogReason(reason)); },
    });
    if (result.status === "rejected") {
      await interaction.editReply({ content: `I could not assign ${result.roleName}: ${result.reason}` });
      return;
    }
    const { moderationCase, roleName } = result;

    const expiresAt = getWarningExpiresAt(moderationCase);
    await dmUser(
      user,
      [
        `You received a warning in ${interaction.guild.name}.`,
        `Case: #${moderationCase.caseNumber}`,
        `Issued by: ${interaction.user.tag}`,
        `Role: ${roleName}`,
        `Duration: ${durationMs ? formatDuration(durationMs) : "Permanent"}`,
        expiresAt
          ? `Role removal: ${time(expiresAt, TimestampStyles.LongDateTime)} (${time(expiresAt, TimestampStyles.RelativeTime)})`
          : null,
        `Reason: ${reason}`,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
      {
        guildId: interaction.guildId,
        userId: user.id,
        caseNumber: moderationCase.caseNumber,
        action: "warn",
      },
    );

    if (durationMs) {
      scheduleWarningRoleRemoval(interaction.client, moderationCase);
    }

    await interaction.editReply({
      content: `Warning created - Case #${moderationCase.caseNumber}; assigned ${roleName}`,
      embeds: [buildCaseEmbed(moderationCase)],
    });
  } catch (error) {
    logger.error({ err: error, guildId: interaction.guildId }, "Warn command failed");
    await interaction.editReply({ content: "I could not create that warning right now." });
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

function validateGlobalWarningRole(guild: Guild, role: Role) {
  if (role.id === guild.id) {
    return "I cannot assign the everyone role.";
  }

  if (role.managed) {
    return "I cannot assign that managed role.";
  }

  if (!role.editable) {
    return "That role is not below my highest role.";
  }

  return null;
}
