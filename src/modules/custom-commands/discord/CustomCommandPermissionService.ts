import { PermissionFlagsBits } from "discord.js";
import type { CustomCommandExecutionContext } from "../discord/types.js";
import { CustomCommandPermissionError } from "../domain/errors.js";
export class CustomCommandPermissionService {
  public check(context: CustomCommandExecutionContext): void {
    const {
      command: c,
      guild,
      member,
      channel,
      guildId,
      channelId,
      userId,
    } = context;
    const deny = (message: string): never => {
      throw new CustomCommandPermissionError(message);
    };
    if (
      c.guildId !== guildId ||
      guild.id !== guildId ||
      member.guild.id !== guildId ||
      channel.guildId !== guildId ||
      channel.id !== channelId ||
      member.id !== userId
    )
      deny("Command context belongs to another server or member.");
    if (!c.enabled) deny("This custom command is disabled.");
    if (
      (context.source === "message" && c.triggerType === "SLASH") ||
      (context.source === "slash" && c.triggerType === "MESSAGE")
    )
      deny("This command does not support that trigger.");
    if (c.deniedChannelIds.includes(channelId))
      deny("This command is denied in this channel.");
    if (c.allowedChannelIds.length && !c.allowedChannelIds.includes(channelId))
      deny("This command is restricted to other channels.");
    if (c.deniedRoleIds.some((id) => member.roles.cache.has(id)))
      deny("Your roles are denied access to this command.");
    if (
      c.allowedRoleIds.length &&
      !c.allowedRoleIds.some((id) => member.roles.cache.has(id))
    )
      deny("You do not have an allowed role for this command.");
    const userPermissions = channel.permissionsFor(member);
    if (!userPermissions?.has(c.requiredUserPermissions))
      deny("You lack the required Discord permissions in this channel.");
    const me = guild.members.me;
    const botPermissions = me ? channel.permissionsFor(me) : null;
    const required = [
      PermissionFlagsBits.ViewChannel,
      channel.isThread()
        ? PermissionFlagsBits.SendMessagesInThreads
        : PermissionFlagsBits.SendMessages,
    ];
    if (c.content.some((response) => response.type === "EMBED"))
      required.push(PermissionFlagsBits.EmbedLinks);
    if (context.source === "message" && c.deleteInvocation)
      required.push(PermissionFlagsBits.ManageMessages);
    if (
      !botPermissions?.has(required) ||
      !botPermissions.has(c.requiredBotPermissions)
    )
      deny("I lack the required Discord permissions in this channel.");
  }
}
