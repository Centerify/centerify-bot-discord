import {
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
  type PermissionsString,
} from "discord.js";

export function hasModeratorPermission(
  member: GuildMember,
  permission: bigint,
) {
  return (
    member.permissions.has(permission) ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  );
}

export function validateBotPermissions(
  guild: Guild,
  permissions: readonly bigint[],
) {
  const me = guild.members.me;
  if (!me) {
    return "I could not resolve my server member.";
  }

  const missing = permissions.filter((permission) => !me.permissions.has(permission));
  if (missing.length > 0) {
    return "I do not have the required server permission for that action.";
  }

  return null;
}

export function validateChannelSendAccess(
  guild: Guild,
  channel: GuildBasedChannel,
) {
  if (!("permissionsFor" in channel)) {
    return "Please choose a text channel I can send messages in.";
  }

  const me = guild.members.me;
  if (!me) {
    return "I could not resolve my server member.";
  }

  const permissions = channel.permissionsFor(me);
  if (
    !permissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
    ])
  ) {
    return "I cannot view and send messages in that channel.";
  }

  return null;
}

export function validateMemberAction({
  guild,
  moderator,
  target,
  allowSelf = false,
}: {
  guild: Guild;
  moderator: GuildMember;
  target: GuildMember;
  allowSelf?: boolean;
}) {
  const me = guild.members.me;

  if (target.id === guild.ownerId) {
    return "I cannot moderate the server owner.";
  }

  if (!allowSelf && moderator.id === target.id) {
    return "You cannot moderate yourself.";
  }

  if (me && target.id === me.id) {
    return "I cannot moderate myself.";
  }

  if (
    moderator.id !== guild.ownerId &&
    target.roles.highest.comparePositionTo(moderator.roles.highest) >= 0
  ) {
    return "That member's highest role is not below yours.";
  }

  if (me && target.roles.highest.comparePositionTo(me.roles.highest) >= 0) {
    return "That member's highest role is not below mine.";
  }

  return null;
}

export function missingPermissionMessage(permissionName: PermissionsString) {
  return `You need ${permissionName} permission to use this command.`;
}
