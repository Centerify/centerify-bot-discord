import { db } from "../../../adapters/prisma/client.js";
import type { XpRepository } from "../application/XpService.js";
import type { XpMethod } from "../domain/policy.js";

export class PrismaXpRepository implements XpRepository {
  constructor(private readonly database: typeof db = db) {}
  async award(guildId: string, userId: string, method: XpMethod, amount: number, cooldownSeconds: number) {
    return this.database.transaction(async (tx) => {
      const rows = await tx.query(this.database.raw.sql`
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
  }
  async sharingConfigurations() {
    return this.database.orm.public.GuildConfig.where({ xpEnabled: true }).all();
  }
  async totals(guildIds: string[], userId?: string) {
    let query = this.database.orm.public.MemberXp.where((row) => row.guildId.in(guildIds));
    if (userId) query = query.where({ userId });
    return query.groupBy("userId").aggregate((aggregate) => ({ xp: aggregate.sum("xp") }));
  }
}
