import type { Client, Guild } from "discord.js";
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

  return { enabled: true, guilds };
}

export function globalModerationDisabledMessage() {
  return "This global moderation action is disabled for this server. Enable it with `/settings` or `/setup` → Global Moderation.";
}
