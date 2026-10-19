import { Command } from "@sapphire/framework";
import { InteractionContextType, PermissionFlagsBits as P, PermissionsBitField } from "discord.js";
import { ManagementError, requireManageableRole, runManagement } from "../guards.js";

export function parseRolePermissions(value: string): bigint {
  if (!value.trim()) return 0n;
  let result = 0n;
  for (const name of value.split(",").map((part) => part.trim())) {
    if (!Object.hasOwn(P, name))
      throw new ManagementError(
        `Unknown permission: ${name}. Use Discord permission names such as ViewChannel, SendMessages.`,
      );
    result |= P[name as keyof typeof P];
  }
  return result;
}

export class RoleCommand extends Command {
  override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) => {
      builder
        .setName("role")
        .setDescription("Create, edit and assign server roles")
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(P.ManageRoles);
      for (const action of ["create", "edit"] as const)
        builder.addSubcommand((sub) => {
          sub.setName(action).setDescription(action === "create" ? "Create a role" : "Edit a role");
          if (action === "edit")
            sub.addRoleOption((o) =>
              o.setName("role").setDescription("Role to edit").setRequired(true),
            );
          return sub
            .addStringOption((o) =>
              o
                .setName("name")
                .setDescription("Role name")
                .setMinLength(1)
                .setMaxLength(100)
                .setRequired(action === "create"),
            )
            .addStringOption((o) =>
              o
                .setName("color")
                .setDescription("Hex color, for example #5865F2")
                .setMinLength(6)
                .setMaxLength(7),
            )
            .addStringOption((o) =>
              o
                .setName("permissions")
                .setDescription("Comma-separated permission names; empty clears all")
                .setMaxLength(1500),
            )
            .addBooleanOption((o) =>
              o.setName("hoist").setDescription("Display separately in the member list"),
            )
            .addBooleanOption((o) =>
              o.setName("mentionable").setDescription("Allow everyone to mention this role"),
            );
        });
      for (const action of ["add", "remove"] as const)
        builder.addSubcommand((sub) =>
          sub
            .setName(action)
            .setDescription(
              `${action === "add" ? "Give a role to" : "Remove a role from"} a member`,
            )
            .addUserOption((o) =>
              o.setName("member").setDescription("Server member").setRequired(true),
            )
            .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
        );
      builder.addSubcommand((sub) =>
        sub
          .setName("delete")
          .setDescription("Permanently delete a role")
          .addRoleOption((o) =>
            o.setName("role").setDescription("Role to delete").setRequired(true),
          )
          .addBooleanOption((o) =>
            o
              .setName("confirm")
              .setDescription("Set true to confirm permanent deletion")
              .setRequired(true),
          ),
      );
      return builder;
    });
  }

  override async chatInputRun(input: Command.ChatInputCommandInteraction) {
    await runManagement(input, P.ManageRoles, async (context) => {
      const { interaction, guild, actor, bot, reason } = context;
      const sub = interaction.options.getSubcommand();
      const role =
        sub === "create"
          ? null
          : await guild.roles.fetch(interaction.options.getRole("role", true).id);
      if (sub !== "create" && !role) throw new ManagementError("That role no longer exists.");
      if (role) requireManageableRole(context, role);
      if (role && sub === "delete") {
        if (interaction.options.getBoolean("confirm", true) !== true)
          throw new ManagementError(
            "Deletion cancelled. Set confirm to true to delete the role permanently.",
          );
        await role.delete(reason);
        return `Deleted role ${role.id}.`;
      }
      if (role && (sub === "add" || sub === "remove")) {
        const target = await guild.members.fetch({
          user: interaction.options.getUser("member", true).id,
          force: true,
        });
        if (
          target.id === bot.id ||
          target.id === guild.ownerId ||
          (target.id !== actor.id &&
            actor.id !== guild.ownerId &&
            target.roles.highest.comparePositionTo(actor.roles.highest) >= 0) ||
          target.roles.highest.comparePositionTo(bot.roles.highest) >= 0
        )
          throw new ManagementError("That member must be below both your highest role and mine.");
        await target.roles[sub](role, reason);
        return `${sub === "add" ? "Added" : "Removed"} <@&${role.id}> ${sub === "add" ? "for" : "from"} <@${target.id}>.`;
      }
      const name = interaction.options.getString("name")?.trim();
      const colorInput = interaction.options.getString("color");
      const permissionsInput = interaction.options.getString("permissions");
      const hoist = interaction.options.getBoolean("hoist");
      const mentionable = interaction.options.getBoolean("mentionable");
      if (name === "") throw new ManagementError("Enter a role name.");
      if (colorInput !== null && !/^#?[0-9a-f]{6}$/i.test(colorInput))
        throw new ManagementError("Use a six-digit hex color, such as #5865F2.");
      const permissions =
        permissionsInput === null
          ? undefined
          : new PermissionsBitField(parseRolePermissions(permissionsInput));
      if (permissions && (!actor.permissions.has(permissions) || !bot.permissions.has(permissions)))
        throw new ManagementError("You can only grant permissions that both you and I have.");
      const options = {
        ...(name ? { name } : {}),
        ...(colorInput !== null
          ? { colors: { primaryColor: parseInt(colorInput.replace("#", ""), 16) } }
          : {}),
        ...(permissions ? { permissions } : {}),
        ...(hoist !== null ? { hoist } : {}),
        ...(mentionable !== null ? { mentionable } : {}),
        reason,
      };
      if (role && Object.keys(options).length === 1)
        throw new ManagementError("Choose at least one role setting to change.");
      const updated = role
        ? await role.edit(options)
        : await guild.roles.create({ ...options, permissions: permissions ?? 0n });
      return `${role ? "Updated" : "Created"} <@&${updated.id}>.`;
    });
  }
}
