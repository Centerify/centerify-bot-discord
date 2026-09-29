import type { Client, Guild } from "discord.js";
import { guildOwnershipService } from "../guildOwnershipService.js";
import { guildConfigService } from "../guildConfigService.js";

export type GlobalModerationTargets = {
  enabled: boolean;
  guilds: Guild[];
};

export async function getGlobalModerationTargets(
  client: Client,
  sourceGuildId: string,
  feature: "ban" | "warn" | "note",
): Promise<GlobalModerationTargets> {
  const sourceGuild = client.guilds.cache.get(sourceGuildId);
  if (!sourceGuild || !await guildOwnershipService.isVerified(sourceGuild)) {
    return { enabled: false, guilds: [] };
  }

  const sourceConfig = await guildConfigService.getOrCreate(sourceGuildId);
  const sourceEnabled = feature === "ban"
    ? sourceConfig.globalBanEnabled
    : feature === "warn"
      ? sourceConfig.globalWarnEnabled
      : sourceConfig.globalNoteEnabled;
  if (!sourceEnabled) {
    return { enabled: false, guilds: [] };
  }

  const guildIds = await guildConfigService.globalModerationGuildIds(feature);
  const guilds = guildIds
    .map((guildId) => client.guilds.cache.get(guildId))
    .filter((guild): guild is Guild => guild !== undefined);

  const verifiedGuilds: Guild[] = [];
  for (const guild of guilds) {
    if (await guildOwnershipService.isVerified(guild)) verifiedGuilds.push(guild);
  }
  return { enabled: true, guilds: verifiedGuilds };
}

export function globalModerationDisabledMessage() {
  return "This global moderation action is disabled for this server. Enable it with `/settings` → Global Moderation.";
}
