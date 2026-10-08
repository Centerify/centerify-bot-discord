import type { GuildConfig } from "../../guilds/index.js";

export function xpConfiguration(config: GuildConfig) {
  return {
    xpEnabled: config.xpEnabled, xpMethods: config.xpMethods,
    xpMessageAmount: config.xpMessageAmount, xpReactionAmount: config.xpReactionAmount,
    xpDailyAmount: config.xpDailyAmount, xpCooldownSeconds: config.xpCooldownSeconds,
    xpSharing: config.xpSharing, xpSharedGuildIds: config.xpSharedGuildIds,
  };
}
export type XpSettings = ReturnType<typeof xpConfiguration>;
export interface XpConfigurationRepository {
  saveAll(updates: { guildId: string; settings: XpSettings }[]): Promise<void>;
}
export class ConfigureXp {
  constructor(private readonly repository: XpConfigurationRepository) {}
  async apply(source: GuildConfig, targetIds: string[]) {
    const ids = [...new Set([source.guildId, ...targetIds])];
    if (ids.length > 25) throw new Error("Choose at most 25 servers, including this server.");
    const values = xpConfiguration(source);
    const selected = [...new Set([...source.xpSharedGuildIds.split(",").filter(Boolean), ...ids])];
    const updates = ids.map((guildId) => {
      const settings = { ...values, xpSharedGuildIds: source.xpSharing === "selected"
        ? selected.filter((id) => id !== guildId).join(",") : values.xpSharedGuildIds };
      if (settings.xpSharedGuildIds.split(",").filter(Boolean).length > 25) throw new Error("Selected sharing supports at most 25 peer servers.");
      return { guildId, settings };
    });
    await this.repository.saveAll(updates);
    return ids;
  }
}
