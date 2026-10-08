import type { Client, Guild } from "discord.js";
import { guildOwnershipService } from "../../guilds/discord/index.js";
import { serviceRef } from "../../../adapters/discord/context.js";
import { globalModerationToken } from "../index.js";
export const globalModeration = serviceRef(globalModerationToken);

export type GlobalModerationTargets = {
  enabled: boolean;
  guilds: Guild[];
};

export async function getGlobalModerationTargets(
  client: Client,
  sourceGuildId: string,
  feature: "ban" | "warn" | "note",
): Promise<GlobalModerationTargets> {
  const targets = await globalModeration.targets(sourceGuildId, feature, {
    async isVerified(id) {
      const guild = client.guilds.cache.get(id);
      return guild ? guildOwnershipService.isVerified(guild) : false;
    },
  });
  return { enabled: targets.enabled, guilds: targets.guildIds.map((id) => client.guilds.cache.get(id)).filter((guild): guild is Guild => Boolean(guild)) };
}

export function globalModerationDisabledMessage() {
  return "This global moderation action is disabled for this server. Enable it with `/settings` → Global Moderation.";
}
