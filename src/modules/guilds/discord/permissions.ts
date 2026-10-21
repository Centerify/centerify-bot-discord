import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
  type Role,
} from "discord.js";
import { validateAutomatedRole } from "./rolePolicy.js";
export * from "./rolePolicy.js";

export function canManageServer(member: GuildMember) {
  return (
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  );
}

export function validateAssignableRole(guild: Guild, role: Role, actor?: GuildMember) {
  const me = guild.members.me;

  if (role.guild.id !== guild.id) return "That role belongs to another server.";
  const unsafe = validateAutomatedRole(role);
  if (unsafe) return unsafe;
  if (
    actor &&
    (actor.guild.id !== guild.id ||
      (actor.id !== guild.ownerId && role.comparePositionTo(actor.roles.highest) >= 0))
  ) {
    return "That role must be below your highest role.";
  }

  if (role.id === guild.id) {
    return "The @everyone role cannot be used as an auto role.";
  }

  if (role.managed) {
    return "Managed integration or bot roles cannot be assigned automatically.";
  }

  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return "I need Manage Roles permission before I can assign this role.";
  }

  if (role.comparePositionTo(me.roles.highest) >= 0) {
    return "That role must be below my highest role.";
  }

  return null;
}

export function isUsableTextChannel(
  channel: unknown,
): channel is Extract<
  GuildBasedChannel,
  { type: ChannelType.GuildText | ChannelType.GuildAnnouncement }
> {
  if (!channel || typeof channel !== "object" || !("type" in channel)) {
    return false;
  }

  return channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
}

export function canSendToChannel(guild: Guild, channel: GuildBasedChannel) {
  if (!("permissionsFor" in channel)) {
    return false;
  }

  const me = guild.members.me;
  if (!me) {
    return false;
  }

  return (
    channel
      .permissionsFor(me)
      ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]) ?? false
  );
}
