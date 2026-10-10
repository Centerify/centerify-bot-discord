import { PermissionFlagsBits, type GuildMember } from "discord.js";
import type { RoleAction, CustomCommandRecord } from "../domain/types.js";
import type { CustomCommandExecutionContext } from "./types.js";
import { CustomCommandPermissionError } from "../domain/errors.js";
import { authorizeComponentAction } from "./actionAuthorization.js";
import { validateMemberAction } from "../../moderation/discord/index.js";
import { renderComponentAction } from "./actionTemplates.js";

/** Only administrator-configured roles can be changed, using single-role endpoints. */
export async function executeRoleAction(
  context: CustomCommandExecutionContext,
  action: RoleAction,
  loadCommand: () => Promise<CustomCommandRecord | undefined>,
  isActive: () => boolean,
): Promise<string> {
  const { context: current, me } = await authorizeComponentAction(
    context,
    loadCommand,
  );
  const rendered = (await renderComponentAction(action, current)) as RoleAction;
  const apply = await prepareRoleAction(current, me, rendered);
  if (!isActive())
    throw new CustomCommandPermissionError(
      "These controls have expired. Run the command again.",
    );
  const result = await apply();
  return rendered.successMessage ?? result;
}

export async function prepareRoleAction(
  context: CustomCommandExecutionContext,
  me: GuildMember,
  action: RoleAction,
): Promise<() => Promise<string>> {
  function deny(message: string): never {
    throw new CustomCommandPermissionError(message);
  }
  if (
    (context.command.sourceGuildId ?? context.command.guildId) !==
    context.guildId
  )
    deny("Role actions can only run in their original server.");
  const targetId = action.userId ?? context.userId;
  const [member, role] = await Promise.all([
    targetId === context.userId
      ? Promise.resolve(context.member)
      : context.guild.members.fetch({ user: targetId, force: true }),
    context.guild.roles.fetch(action.roleId, { force: true }),
  ]);
  if (targetId !== context.userId) {
    if (!context.member.permissions.has(PermissionFlagsBits.ManageRoles))
      deny("You need Manage Roles to change another member's roles.");
    const error = validateMemberAction({
      guild: context.guild,
      moderator: context.member,
      target: member,
    });
    if (error) deny(error);
  }
  if (
    !role ||
    role.guild.id !== context.guildId ||
    role.id === context.guildId ||
    role.managed
  )
    deny("That role is unavailable or cannot be changed.");
  if (
    !me.permissions.has(PermissionFlagsBits.ManageRoles) ||
    me.roles.highest.comparePositionTo(role) <= 0
  )
    deny("I need Manage Roles and a role above the selected role.");
  if (!member.manageable)
    deny("I cannot manage your roles with my current role hierarchy.");
  if (
    targetId !== context.userId &&
    context.member.id !== context.guild.ownerId &&
    context.member.roles.highest.comparePositionTo(role) <= 0
  )
    deny("That role is not below your highest role.");
  return async () => {
    const hasRole = member.roles.cache.has(action.roleId);
    const remove =
      action.action === "removerole" ||
      (action.action === "togglerole" && hasRole);
    const reason = `Custom command ${context.command.name} (${context.command.id}), requested by ${context.userId}`;
    if (remove && hasRole) await member.roles.remove(action.roleId, reason);
    else if (!remove && !hasRole) await member.roles.add(action.roleId, reason);
    return remove ? "Role removed." : "Role added.";
  };
}
