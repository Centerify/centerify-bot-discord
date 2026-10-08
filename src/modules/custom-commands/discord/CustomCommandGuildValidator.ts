import type { Guild } from "discord.js";
import type { CustomCommandDefinition } from "../domain/types.js";
import { CustomCommandValidationError } from "../domain/errors.js";
export async function validateGuildReferences(
  guild: Guild,
  commands: CustomCommandDefinition[],
): Promise<void> {
  const roles = new Set(
    commands.flatMap((command) => [
      ...command.allowedRoleIds,
      ...command.deniedRoleIds,
    ]),
  );
  const channels = new Set(
    commands.flatMap((command) => [
      ...command.allowedChannelIds,
      ...command.deniedChannelIds,
    ]),
  );
  // Refresh before administrative writes; don't trust submitted select/attachment IDs.
  if (roles.size) await guild.roles.fetch();
  if (channels.size) await guild.channels.fetch();
  for (const id of roles)
    if (!guild.roles.cache.has(id))
      throw new CustomCommandValidationError(
        `Role ${id} does not belong to this server.`,
      );
  for (const id of channels) {
    const channel = guild.channels.cache.get(id);
    if (!channel || channel.guildId !== guild.id || !channel.isTextBased())
      throw new CustomCommandValidationError(
        `Channel ${id} is not a text channel in this server.`,
      );
  }
}
