import { PermissionFlagsBits, type Role } from "discord.js";

// Automated and self-service roles must never confer server administration.
// Keep this policy shared by settings, join events, warnings and role buttons.
export const privilegedRolePermissions = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageThreads,
  PermissionFlagsBits.ManageNicknames,
  PermissionFlagsBits.MentionEveryone,
  PermissionFlagsBits.ViewAuditLog,
  PermissionFlagsBits.ManageGuildExpressions,
  PermissionFlagsBits.ManageEvents,
  PermissionFlagsBits.MuteMembers,
  PermissionFlagsBits.DeafenMembers,
  PermissionFlagsBits.MoveMembers,
] as const;

export function hasPrivilegedPermissions(role: Role): boolean {
  return role.permissions.any([...privilegedRolePermissions], false);
}

export function validateAutomatedRole(role: Role): string | null {
  return hasPrivilegedPermissions(role)
    ? "Automatic and warning roles cannot have administrative or moderation permissions."
    : null;
}
