import type { GuildConfigStore } from "../../guilds/index.js";
import { earningRule, sharedXpGuildIds, type XpConfig, type XpMethod } from "../domain/policy.js";

export interface XpRepository {
  award(guildId: string, userId: string, method: XpMethod, amount: number, cooldownSeconds: number): Promise<boolean>;
  sharingConfigurations(): Promise<XpConfig[]>;
  totals(guildIds: string[], userId?: string): Promise<{ userId: string; xp: number | null }[]>;
}

export class XpService {
  constructor(private readonly repository: XpRepository, private readonly config: Pick<GuildConfigStore, "getOrCreate">) {}
  async award(guildId: string, userId: string, method: XpMethod = "messages") {
    return (await this.earn(guildId, userId, method)).status === "awarded";
  }
  async earn(guildId: string, userId: string, method: XpMethod) {
    const config = await this.config.getOrCreate(guildId);
    const rule = earningRule(config, method);
    if (!rule) return { status: "disabled" as const, amount: 0 };
    const awarded = await this.repository.award(guildId, userId, method, rule.amount, rule.cooldownSeconds);
    return { status: awarded ? "awarded" as const : "cooldown" as const, amount: rule.amount };
  }
  async totals(guildId: string, userId?: string) {
    const config = await this.config.getOrCreate(guildId);
    const configs = config.xpSharing === "server" ? [] : await this.repository.sharingConfigurations();
    const totals = await this.repository.totals(sharedXpGuildIds(config, configs), userId);
    return totals.map((row) => ({ userId: row.userId, xp: row.xp ?? 0 }))
      .sort((a, b) => b.xp - a.xp || a.userId.localeCompare(b.userId));
  }
}
