import { ChannelType, PermissionFlagsBits, type GuildMember } from "discord.js";
import type { ChannelAction } from "../domain/types.js";
import type { CustomCommandExecutionContext } from "./types.js";
import { CustomCommandPermissionError } from "../domain/errors.js";
import { toAuditLogReason } from "../../moderation/discord/index.js";

export async function prepareChannelAction(
  context: CustomCommandExecutionContext,
  me: GuildMember,
  action: ChannelAction,
): Promise<() => Promise<string>> {
  const deny = (message: string): never => {
    throw new CustomCommandPermissionError(message);
  };
  // Fetch even the invocation channel: earlier workflow steps may have moved it.
  const channel = await context.guild.channels.fetch(action.channelId, {
    force: true,
  });
  if (
    !channel ||
    channel.guildId !== context.guildId ||
    (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
  )
    return deny("Choose a text or announcement channel in this server.");
  const permissions = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels];
  if (
    !channel.permissionsFor(context.member)?.has(permissions) ||
    !channel.permissionsFor(me)?.has(permissions)
  )
    deny("You and I both need View Channel and Manage Channels in the target channel.");
  const reason = toAuditLogReason(
    `Custom command ${context.command.name} (${context.command.id}), requested by ${context.userId}`,
  );
  switch (action.action) {
    case "setchannelname":
      return async () => {
        await channel.setName(action.name, reason);
        return "Channel name updated.";
      };
    case "setchanneltopic":
      return async () => {
        await channel.setTopic(action.topic || null, reason);
        return "Channel topic updated.";
      };
    case "setslowmode":
      if (channel.type !== ChannelType.GuildText)
        return deny("Slowmode requires a regular text channel.");
      return async () => {
        await channel.setRateLimitPerUser(action.seconds, reason);
        return action.seconds ? "Channel slowmode updated." : "Channel slowmode disabled.";
      };
    case "setchannelcategory": {
      if (action.categoryId !== null) {
        const category = await context.guild.channels.fetch(action.categoryId, {
          force: true,
        });
        if (
          !category ||
          category.guildId !== context.guildId ||
          category.type !== ChannelType.GuildCategory
        )
          return deny("Choose a category in this server.");
        if (
          !category.permissionsFor(context.member)?.has(permissions) ||
          !category.permissionsFor(me)?.has(permissions)
        )
          deny("You and I both need View Channel and Manage Channels in the destination category.");
      }
      return async () => {
        await channel.setParent(action.categoryId, {
          lockPermissions: false,
          reason,
        });
        return "Channel category updated.";
      };
    }
  }
}
