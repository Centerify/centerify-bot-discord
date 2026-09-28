import type { Guild, RepliableInteraction, ContextMenuCommandInteraction } from "discord.js";
import { MessageFlags } from "discord.js";
import { db } from "../prisma/db.js";
import { logger } from "../logger.js";

export const OWNERSHIP_REQUIRED_MESSAGE =
  "The server owner must run `/verify` before Centerify can work in this server.";

export class GuildOwnershipService {
  public async isVerified(guild: Guild): Promise<boolean> {
    try {
      // Refresh Discord ownership so a transfer invalidates the old approval.
      const currentGuild = await guild.fetch();
      const ownership = await db.orm.public.GuildOwnership
        .where({ guildId: guild.id }).first();
      return ownership !== null && ownership.ownerUserId === currentGuild.ownerId;
    } catch (error) {
      logger.error({ err: error, guildId: guild.id }, "Failed to check guild ownership");
      return false;
    }
  }

  public async verify(guild: Guild, userId: string): Promise<boolean> {
    const currentGuild = await guild.fetch();
    if (currentGuild.ownerId !== userId) {
      return false;
    }

    await db.orm.public.GuildOwnership.upsert({
      conflictOn: { guildId: guild.id },
      create: { guildId: guild.id, ownerUserId: userId },
      update: { ownerUserId: userId, verifiedAt: new Date().toISOString() },
    });
    return true;
  }
}

export const guildOwnershipService = new GuildOwnershipService();

export async function requireVerifiedOwnership(interaction: RepliableInteraction | ContextMenuCommandInteraction) {
  if (interaction.guild && await guildOwnershipService.isVerified(interaction.guild)) {
    return true;
  }
  const response = { content: OWNERSHIP_REQUIRED_MESSAGE, flags: MessageFlags.Ephemeral as const };
  if (interaction.deferred && !interaction.replied) {
    await interaction.editReply({ content: OWNERSHIP_REQUIRED_MESSAGE });
  } else if (interaction.replied) {
    await interaction.followUp(response);
  } else {
    await interaction.reply(response);
  }
  return false;
}
