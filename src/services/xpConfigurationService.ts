import type { Client } from "discord.js";
import { db } from "../prisma/db.js";
import { guildOwnershipService } from "./guildOwnershipService.js";
import type { GuildConfig } from "./guildConfigService.js";
import { canManageServer } from "./setup/guards.js";

export function xpConfiguration(config: GuildConfig) {
  return {
    xpEnabled: config.xpEnabled, xpMethods: config.xpMethods,
    xpMessageAmount: config.xpMessageAmount, xpReactionAmount: config.xpReactionAmount,
    xpDailyAmount: config.xpDailyAmount, xpCooldownSeconds: config.xpCooldownSeconds,
    xpSharing: config.xpSharing, xpSharedGuildIds: config.xpSharedGuildIds,
  };
}

export class XpConfigurationService {
  public async apply(client: Client, userId: string, source: GuildConfig, targetIds: string[]) {
    const ids = [...new Set([source.guildId, ...targetIds])];
    if (ids.length > 25) throw new Error("Choose at most 25 servers, including this server.");
    // Validate every server before writing, then commit the whole group together.
    for (const id of ids) {
      const guild = client.guilds.cache.get(id);
      if (!guild) throw new Error(`Centerify must be in server ${id}.`);
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member || !canManageServer(member)) throw new Error(`You need Manage Server permission in server ${id}.`);
      if (!await guildOwnershipService.isVerified(guild)) throw new Error(`The owner of server ${id} must run /verify first.`);
    }
    const values = xpConfiguration(source);
    const selected = [...new Set([...source.xpSharedGuildIds.split(",").filter(Boolean), ...ids])];
    await db.transaction(async (tx) => {
      for (const guildId of ids) {
        const data = { ...values, xpSharedGuildIds: source.xpSharing === "selected"
          ? selected.filter((id) => id !== guildId).join(",") : values.xpSharedGuildIds };
        if (data.xpSharedGuildIds.split(",").filter(Boolean).length > 25) throw new Error("Selected sharing supports at most 25 peer servers.");
        await tx.orm.public.GuildConfig.upsert({ create: { guildId, ...data }, update: data, conflictOn: { guildId } });
      }
    });
    return ids;
  }
}
export const xpConfigurationService = new XpConfigurationService();
