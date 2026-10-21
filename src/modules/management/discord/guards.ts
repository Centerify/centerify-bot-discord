import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type GuildBasedChannel,
  type Role,
} from "discord.js";
import { logger } from "../../../adapters/logging/runtime.js";

export class ManagementError extends Error {}

export interface ManagementContext {
  interaction: ChatInputCommandInteraction<"cached">;
  guild: Guild;
  actor: GuildMember;
  bot: GuildMember;
  reason: string;
}

export async function runManagement(
  interaction: ChatInputCommandInteraction,
  permission: bigint,
  run: (context: ManagementContext) => Promise<string>,
) {
  if (!interaction.deferred && !interaction.replied)
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    if (!interaction.inCachedGuild())
      throw new ManagementError("Use this command inside a server.");
    const guild = interaction.guild;
    const [actor, bot] = await Promise.all([
      guild.members.fetch({ user: interaction.user.id, force: true }),
      guild.members.fetchMe({ force: true }),
    ]);
    if (actor.id !== guild.ownerId && !actor.permissions.has(permission))
      throw new ManagementError("You do not have the required Discord permission for this action.");
    if (!bot.permissions.has(permission))
      throw new ManagementError("I do not have the required Discord permission for this action.");
    const supplied = interaction.options.getString("reason")?.trim();
    const reason = `Centerify: ${interaction.user.id}${supplied ? ` — ${supplied}` : ""}`.slice(
      0,
      512,
    );
    const content = await run({ interaction, guild, actor, bot, reason });
    await interaction.editReply({ content, allowedMentions: { parse: [] } });
  } catch (error) {
    if (!(error instanceof ManagementError))
      logger.error(
        { err: error, guildId: interaction.guildId, command: interaction.commandName },
        "Management command failed",
      );
    await interaction.editReply({
      content:
        error instanceof ManagementError
          ? error.message
          : "I could not complete that action. Check my permissions and role position, then try again.",
      allowedMentions: { parse: [] },
    });
  }
}

export function requireChannelAccess(
  context: ManagementContext,
  channel: GuildBasedChannel,
  permissions: bigint[],
) {
  if (
    !channel.permissionsFor(context.actor)?.has(permissions) ||
    !channel.permissionsFor(context.bot)?.has(permissions)
  )
    throw new ManagementError("Both you and I need the required permissions in that channel.");
}

export function requireManageableRole({ guild, actor, bot }: ManagementContext, role: Role) {
  if (role.id === guild.id || role.managed)
    throw new ManagementError("The everyone role and integration roles cannot be managed here.");
  if (
    role.comparePositionTo(bot.roles.highest) >= 0 ||
    (actor.id !== guild.ownerId && role.comparePositionTo(actor.roles.highest) >= 0)
  )
    throw new ManagementError("That role must be below both your highest role and mine.");
  if (!actor.permissions.has(role.permissions) || !bot.permissions.has(role.permissions))
    throw new ManagementError(
      "You cannot manage a role with permissions that you or I do not have.",
    );
}
