import { PermissionFlagsBits } from "discord.js";
import type { ComponentAction, CustomCommandRecord } from "../domain/types.js";
import type { CustomCommandExecutionContext } from "./types.js";
import { CustomCommandPermissionError } from "../domain/errors.js";
import { CustomCommandPermissionService } from "./CustomCommandPermissionService.js";

/** Only administrator-configured roles can be changed, using single-role endpoints. */
export async function executeRoleAction(
  context: CustomCommandExecutionContext,
  action: Extract<ComponentAction, { roleId: string }>,
  loadCommand: () => Promise<CustomCommandRecord | undefined>,
  isActive: () => boolean,
): Promise<string> {
  function deny(message: string): never {
    throw new CustomCommandPermissionError(message);
  }
  if (
    (context.command.sourceGuildId ?? context.command.guildId) !==
    context.guildId
  )
    deny("Role actions can only run in their original server.");
  const command = await loadCommand();
  if (
    !command ||
    command.id !== context.command.id ||
    command.updatedAt !== context.command.updatedAt ||
    JSON.stringify(command.content) !== JSON.stringify(context.command.content)
  )
    deny(
      "This command has changed or was deleted. Run it again to use its controls.",
    );
  const [member, me, role] = await Promise.all([
    context.guild.members.fetch({ user: context.userId, force: true }),
    context.guild.members.fetchMe({ force: true }),
    context.guild.roles.fetch(action.roleId, { force: true }),
  ]);
  new CustomCommandPermissionService().check({
    ...context,
    command,
    member,
    source: "button",
  });
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
  if (!isActive()) deny("These controls have expired. Run the command again.");
  const hasRole = member.roles.cache.has(action.roleId);
  const remove =
    action.action === "removerole" ||
    (action.action === "togglerole" && hasRole);
  const reason = `Custom command ${command.name} (${command.id}), requested by ${context.userId}`;
  if (remove && hasRole) await member.roles.remove(action.roleId, reason);
  else if (!remove && !hasRole) await member.roles.add(action.roleId, reason);
  return remove ? "Role removed." : "Role added.";
}
