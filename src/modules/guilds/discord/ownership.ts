import type { Guild, RepliableInteraction, ContextMenuCommandInteraction } from "discord.js";
import { MessageFlags } from "discord.js";
import { currentApplication } from "../../../adapters/discord/context.js";
import { guildOwnershipToken, type VerifyGuildOwnership } from "../index.js";
import { logger } from "../../../adapters/logging/runtime.js";
import { replyToCommand } from "../../../adapters/discord/interactions.js";

export const OWNERSHIP_REQUIRED_MESSAGE =
  "The server owner must run `/verify` before Centerify can work in this server.";

type Ownership = Pick<VerifyGuildOwnership, keyof VerifyGuildOwnership>;

export class GuildOwnershipService {
  private readonly pendingChecks = new WeakMap<
    Guild,
    { ownership: Ownership; promise: Promise<boolean> }
  >();
  constructor(private readonly ownership?: Ownership) {}
  public isVerified(guild: Guild): Promise<boolean> {
    const ownership = this.ownership ?? currentApplication().resolve(guildOwnershipToken);
    const pending = this.pendingChecks.get(guild);
    if (pending?.ownership === ownership) return pending.promise;
    // Share only overlapping checks in this application; completed checks are
    // never cached, so the next event still refreshes ownership from Discord.
    const check = this.checkOwnership(guild, ownership).finally(() => {
      if (this.pendingChecks.get(guild)?.promise === check) this.pendingChecks.delete(guild);
    });
    this.pendingChecks.set(guild, { ownership, promise: check });
    return check;
  }

  private async checkOwnership(guild: Guild, ownership: Ownership): Promise<boolean> {
    try {
      // Refresh Discord ownership so a transfer invalidates the old approval.
      const currentGuild = await guild.fetch();
      return await ownership.isVerified(guild.id, currentGuild.ownerId);
    } catch (error) {
      logger.error({ err: error, guildId: guild.id }, "Failed to check guild ownership");
      return false;
    }
  }

  public async verify(guild: Guild, userId: string): Promise<boolean> {
    const ownership = this.ownership ?? currentApplication().resolve(guildOwnershipToken);
    const currentGuild = await guild.fetch();
    const verified = await ownership.verify(guild.id, currentGuild.ownerId, userId);
    this.pendingChecks.delete(guild);
    return verified;
  }

  public async unverify(guild: Guild, userId: string): Promise<boolean> {
    const ownership = this.ownership ?? currentApplication().resolve(guildOwnershipToken);
    const currentGuild = await guild.fetch();
    const unverified = await ownership.unverify(guild.id, currentGuild.ownerId, userId);
    this.pendingChecks.delete(guild);
    return unverified;
  }
}

export const guildOwnershipService = new GuildOwnershipService();

export async function requireVerifiedOwnership(
  interaction: RepliableInteraction | ContextMenuCommandInteraction,
) {
  if (interaction.guild && (await guildOwnershipService.isVerified(interaction.guild))) {
    return true;
  }
  const response = { content: OWNERSHIP_REQUIRED_MESSAGE, flags: MessageFlags.Ephemeral as const };
  // A component deferUpdate targets its panel, rather than a loading reply.
  // Denial must not delete or overwrite that panel.
  if (interaction.deferred && interaction.isMessageComponent?.())
    await interaction.followUp(response);
  else await replyToCommand(interaction, response);
  return false;
}
