import {
  Colors,
  EmbedBuilder,
  TimestampStyles,
  escapeMarkdown,
  time,
} from "discord.js";
import { formatDuration } from "./durationParser.js";

export type ModerationCaseView = {
  caseNumber: number;
  targetUserId: string;
  moderatorUserId: string;
  action: string;
  reason: string;
  durationMs: number | null;
  metadata?: unknown;
  createdAt: string;
};

export function buildCaseEmbed(moderationCase: ModerationCaseView) {
  const roleId = warningRoleId(moderationCase.metadata);

  return new EmbedBuilder()
    .setColor(actionColor(moderationCase.action))
    .setTitle(`Case #${moderationCase.caseNumber} - ${formatAction(moderationCase.action)}`)
    .addFields(
      { name: "User", value: `<@${moderationCase.targetUserId}>`, inline: true },
      {
        name: "Moderator",
        value: `<@${moderationCase.moderatorUserId}>`,
        inline: true,
      },
      {
        name: "Created",
        value: time(new Date(moderationCase.createdAt), TimestampStyles.ShortDateTime),
        inline: true,
      },
      {
        name: "Duration",
        value: formatDuration(moderationCase.durationMs),
        inline: true,
      },
      ...(roleId
        ? [
            {
              name: "Role",
              value: `<@&${roleId}>`,
              inline: true,
            },
          ]
        : []),
      {
        name: "Reason",
        value: cleanFieldValue(moderationCase.reason),
      },
    )
    .setTimestamp();
}

function warningRoleId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const roleId = (metadata as Record<string, unknown>)["warningRoleId"];
  return typeof roleId === "string" ? roleId : null;
}

export function formatCaseLine(moderationCase: ModerationCaseView) {
  return [
    `**#${moderationCase.caseNumber} ${formatAction(moderationCase.action)}**`,
    time(new Date(moderationCase.createdAt), TimestampStyles.ShortDate),
    `by <@${moderationCase.moderatorUserId}>`,
    `- ${escapeMarkdown(moderationCase.reason)}`,
  ].join(" ");
}

export function formatAction(action: string) {
  return action
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function cleanFieldValue(value: string, maxLength = 1_000) {
  const trimmed = value.trim();
  const safe = trimmed.length > 0 ? trimmed : "No reason provided.";
  return escapeMarkdown(
    safe.length > maxLength ? `${safe.slice(0, maxLength - 1)}...` : safe,
  );
}

function actionColor(action: string) {
  switch (action) {
    case "WARNING":
    case "NOTE":
      return Colors.Yellow;
    case "TIMEOUT":
      return Colors.Orange;
    case "KICK":
    case "BAN":
      return Colors.Red;
    case "UNBAN":
      return Colors.Green;
    default:
      return Colors.Blurple;
  }
}
