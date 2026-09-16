import {
  ChannelType,
  type GuildTextBasedChannel,
  type User,
} from "discord.js";
import { logger } from "../../logger.js";

const maxAuditLogReasonLength = 512;

export async function dmUser(
  user: User,
  content: string,
  context: Record<string, unknown>,
) {
  await user.send({ content }).catch((error) => {
    logger.warn({ err: error, ...context }, "Failed to send moderation DM");
  });
}

export function isModerationLogChannel(
  channel: unknown,
): channel is GuildTextBasedChannel {
  if (!channel || typeof channel !== "object" || !("type" in channel)) {
    return false;
  }

  return (
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.GuildAnnouncement
  );
}

export function toAuditLogReason(reason: string) {
  const trimmed = reason.trim();
  if (trimmed.length <= maxAuditLogReasonLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxAuditLogReasonLength - 3)}...`;
}
