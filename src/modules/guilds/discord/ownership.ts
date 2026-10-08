import type { Guild, RepliableInteraction, ContextMenuCommandInteraction } from "discord.js";
import { MessageFlags } from "discord.js";
import { serviceRef } from "../../../adapters/discord/context.js";
import { guildOwnershipToken, type VerifyGuildOwnership } from "../index.js";
import { logger } from "../../../adapters/logging/runtime.js";

export const OWNERSHIP_REQUIRED_MESSAGE =
  "The server owner must run `/verify` before Centerify can work in this server.";

export class GuildOwnershipService {
  constructor(private readonly ownership: Pick<VerifyGuildOwnership, keyof VerifyGuildOwnership> = serviceRef(guildOwnershipToken)) {}
  public async isVerified(guild: Guild): Promise<boolean> {
    try {
      // Refresh Discord ownership so a transfer invalidates the old approval.
      const currentGuild = await guild.fetch();
      return await this.ownership.isVerified(guild.id, currentGuild.ownerId);
    } catch (error) {
      logger.error({ err: error, guildId: guild.id }, "Failed to check guild ownership");
      return false;
    }
  }

  public async verify(guild: Guild, userId: string): Promise<boolean> {
    const currentGuild = await guild.fetch();
    return this.ownership.verify(guild.id, currentGuild.ownerId, userId);
  }

  public async unverify(guild: Guild, userId: string): Promise<boolean> {
    const currentGuild = await guild.fetch();
    return this.ownership.unverify(guild.id, currentGuild.ownerId, userId);
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
