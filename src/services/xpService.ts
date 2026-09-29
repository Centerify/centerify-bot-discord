import { db } from "../prisma/db.js";
import { guildConfigService } from "./guildConfigService.js";
import { earningRule, sharedXpGuildIds, type XpMethod } from "./xpPolicy.js";

export class XpService {
  public async award(guildId: string, userId: string, method: XpMethod = "messages") {
    return (await this.earn(guildId, userId, method)).status === "awarded";
  }

  public async earn(guildId: string, userId: string, method: XpMethod) {
    const config = await guildConfigService.getOrCreate(guildId);
    const rule = earningRule(config, method);
    if (!rule) return { status: "disabled" as const, amount: 0 };
    const { amount, cooldownSeconds } = rule;
    // Each method has an independent persisted cooldown. One statement locks and
    // updates the member row, preventing double awards across bot processes.
    const awarded = await db.transaction(async (tx) => {
      const rows = await tx.query(db.raw.sql`
        INSERT INTO member_xp ("guildId", "userId", xp, "lastAwardedAt", "lastReactionAwardedAt", "lastDailyAwardedAt")
        VALUES (${guildId}, ${userId}, ${amount},
          CASE WHEN ${method} = 'messages' THEN now() ELSE '1970-01-01'::timestamptz END,
          CASE WHEN ${method} = 'reactions' THEN now() ELSE NULL END,
          CASE WHEN ${method} = 'daily' THEN now() ELSE NULL END)
        ON CONFLICT ("guildId", "userId") DO UPDATE
        SET xp = member_xp.xp + ${amount},
          "lastAwardedAt" = CASE WHEN ${method} = 'messages' THEN now() ELSE member_xp."lastAwardedAt" END,
          "lastReactionAwardedAt" = CASE WHEN ${method} = 'reactions' THEN now() ELSE member_xp."lastReactionAwardedAt" END,
          "lastDailyAwardedAt" = CASE WHEN ${method} = 'daily' THEN now() ELSE member_xp."lastDailyAwardedAt" END
        WHERE COALESCE(CASE ${method}
          WHEN 'messages' THEN member_xp."lastAwardedAt"
          WHEN 'reactions' THEN member_xp."lastReactionAwardedAt"
          WHEN 'daily' THEN member_xp."lastDailyAwardedAt"
        END, '1970-01-01'::timestamptz) <= now() - (${cooldownSeconds} * interval '1 second')
        RETURNING xp
      `.returnsRow({ xp: "pg/int4@1" }).build());
      return rows.length > 0;
    });
    return { status: awarded ? "awarded" as const : "cooldown" as const, amount };
  }

  public async totals(guildId: string, userId?: string) {
    const config = await guildConfigService.getOrCreate(guildId);
    const configs = config.xpSharing === "server" ? [] : await db.orm.public.GuildConfig.where({ xpEnabled: true }).all();
    const guildIds = sharedXpGuildIds(config, configs);
    let query = db.orm.public.MemberXp.where((row) => row.guildId.in(guildIds));
    if (userId) query = query.where({ userId });
    const totals = await query.groupBy("userId").aggregate((aggregate) => ({ xp: aggregate.sum("xp") }));
    return totals.map((row) => ({ userId: row.userId, xp: row.xp ?? 0 }))
      .sort((a, b) => b.xp - a.xp || a.userId.localeCompare(b.userId));
  }
}

export const xpService = new XpService();
