import type { GuildConfigStore } from "../../guilds/index.js";
import { earningRule, sharedXpGuildIds, type XpConfig, type XpMethod } from "../domain/policy.js";

export interface XpRepository {
  award(
    guildId: string,
    userId: string,
    method: XpMethod,
    amount: number,
    cooldownSeconds: number,
  ): Promise<boolean>;
  sharingConfigurations(): Promise<XpConfig[]>;
  totals(guildIds: string[], userId?: string): Promise<{ userId: string; xp: number | null }[]>;
}

export class XpService {
  private readonly lastAwards = new Map<string, number>();
  private readonly pendingAwards = new Map<
    string,
    { startedAt: number; promise: Promise<boolean> }
  >();

  constructor(
    private readonly repository: XpRepository,
    private readonly config: Pick<GuildConfigStore, "getOrCreate">,
    private readonly now: () => number = () => performance.now(),
    private readonly maxCooldownEntries = 100_000,
  ) {}
  async award(guildId: string, userId: string, method: XpMethod = "messages") {
    return (await this.earn(guildId, userId, method)).status === "awarded";
  }
  async earn(guildId: string, userId: string, method: XpMethod) {
    const config = await this.config.getOrCreate(guildId);
    const rule = earningRule(config, method);
    if (!rule) return { status: "disabled" as const, amount: 0 };
    const key = `${guildId}:${userId}:${method}`;
    const startedAt = this.now();
    const lastAward = this.lastAwards.get(key);
    if (lastAward !== undefined && startedAt - lastAward < rule.cooldownSeconds * 1000)
      return { status: "cooldown" as const, amount: rule.amount };

    // Include the rule so an in-flight write cannot hide a settings change.
    const pendingKey = `${key}:${rule.amount}:${rule.cooldownSeconds}`;
    const pending = this.pendingAwards.get(pendingKey);
    if (pending && startedAt - pending.startedAt < rule.cooldownSeconds * 1000) {
      await pending.promise;
      return { status: "cooldown" as const, amount: rule.amount };
    }

    const write = this.repository.award(guildId, userId, method, rule.amount, rule.cooldownSeconds);
    this.pendingAwards.set(pendingKey, { startedAt, promise: write });
    try {
      const awarded = await write;
      if (awarded && this.maxCooldownEntries > 0) {
        // Start the cooldown before I/O, conservatively. PostgreSQL remains the
        // authority after eviction, a restart, or awards from another process.
        const latestAward = Math.max(startedAt, this.lastAwards.get(key) ?? -Infinity);
        this.lastAwards.delete(key);
        if (this.lastAwards.size >= this.maxCooldownEntries)
          this.lastAwards.delete(this.lastAwards.keys().next().value!);
        this.lastAwards.set(key, latestAward);
      }
      return {
        status: awarded ? ("awarded" as const) : ("cooldown" as const),
        amount: rule.amount,
      };
    } finally {
      if (this.pendingAwards.get(pendingKey)?.promise === write)
        this.pendingAwards.delete(pendingKey);
    }
  }
  async totals(guildId: string, userId?: string) {
    const config = await this.config.getOrCreate(guildId);
    const configs =
      config.xpSharing === "server" ? [] : await this.repository.sharingConfigurations();
    const totals = await this.repository.totals(sharedXpGuildIds(config, configs), userId);
    return totals
      .map((row) => ({ userId: row.userId, xp: row.xp ?? 0 }))
      .sort((a, b) => b.xp - a.xp || a.userId.localeCompare(b.userId));
  }
}
