import {
  Colors,
  EmbedBuilder,
  TimestampStyles,
  escapeMarkdown,
  time,
} from "discord.js";
import { formatDuration } from "./durationParser.js";
import {
  getWarningExpiresAt,
  getWarningRevocation,
  hasWarningDurationEnded,
  warningRoleId,
} from "./warningLifecycle.js";

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
  const expiresAt = getWarningExpiresAt(moderationCase);
  const revocation = getWarningRevocation(moderationCase.metadata);

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
      ...(expiresAt
        ? [
            {
              name: hasWarningDurationEnded(moderationCase)
                ? "Warning expired"
                : revocation
                  ? "Original expiry"
                  : "Role removal",
              value: `${time(expiresAt, TimestampStyles.ShortDateTime)} (${time(expiresAt, TimestampStyles.RelativeTime)})`,
              inline: true,
            },
          ]
        : []),
      ...(revocation
        ? [
            {
              name: "Warning revoked",
              value: `${time(new Date(revocation.revokedAt), TimestampStyles.ShortDateTime)} by <@${revocation.revokedBy}>`,
              inline: true,
            },
            {
              name: "Revocation reason",
              value: cleanFieldValue(revocation.revocationReason),
            },
          ]
        : []),
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

export function formatCaseLine(moderationCase: ModerationCaseView) {
  const warningTiming = formatWarningTiming(moderationCase);

  return [
    `**#${moderationCase.caseNumber} ${formatAction(moderationCase.action)}**`,
    time(new Date(moderationCase.createdAt), TimestampStyles.ShortDate),
    `by <@${moderationCase.moderatorUserId}>`,
    `- ${cleanFieldValue(moderationCase.reason, 120)}`,
    warningTiming ? `\n${warningTiming}` : null,
  ].filter((part): part is string => part !== null).join(" ");
}

export function formatDetailedCaseField(
  moderationCase: ModerationCaseView,
  now: Date | number = Date.now(),
) {
  const createdAt = new Date(moderationCase.createdAt);
  const warningTiming = formatWarningTiming(moderationCase, now);
  const status = caseStatus(moderationCase, now);

  return {
    name: `#${moderationCase.caseNumber} • ${formatAction(moderationCase.action)} • ${status}`,
    value: [
      `**Reason:** ${cleanFieldValue(moderationCase.reason, 140)}`,
      `**Moderator:** <@${moderationCase.moderatorUserId}>`,
      `**Created:** ${time(createdAt, TimestampStyles.ShortDateTime)} (${time(createdAt, TimestampStyles.RelativeTime)})`,
      warningTiming,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
    inline: false,
  };
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

function formatWarningTiming(
  moderationCase: ModerationCaseView,
  now: Date | number = Date.now(),
) {
  if (moderationCase.action !== "WARNING") {
    return null;
  }

  const revocation = getWarningRevocation(moderationCase.metadata);
  if (revocation) {
    return [
      `**Warning status:** Revoked ${time(new Date(revocation.revokedAt), TimestampStyles.RelativeTime)} by <@${revocation.revokedBy}> • no longer counts`,
      `**Revocation reason:** ${cleanFieldValue(revocation.revocationReason, 140)}`,
    ].join("\n");
  }

  const expiresAt = getWarningExpiresAt(moderationCase);
  if (!expiresAt) {
    return "**Warning status:** Permanent • counts toward the active warning level";
  }

  if (hasWarningDurationEnded(moderationCase, now)) {
    return `**Warning status:** Expired ${time(expiresAt, TimestampStyles.RelativeTime)} • no longer counts`;
  }

  return `**Role removal:** ${time(expiresAt, TimestampStyles.ShortDateTime)} (${time(expiresAt, TimestampStyles.RelativeTime)}) • counts until then`;
}

function caseStatus(
  moderationCase: ModerationCaseView,
  now: Date | number = Date.now(),
) {
  if (moderationCase.action !== "WARNING") {
    return "Recorded";
  }

  if (getWarningRevocation(moderationCase.metadata)) {
    return "Revoked";
  }

  if (!getWarningExpiresAt(moderationCase)) {
    return "Permanent";
  }

  return hasWarningDurationEnded(moderationCase, now) ? "Expired" : "Active";
}
