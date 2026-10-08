import { db } from "../../../adapters/prisma/client.js";
import type { XpConfigurationRepository, XpSettings } from "../application/ConfigureXp.js";
export class PrismaXpConfigurationRepository implements XpConfigurationRepository {
  constructor(private readonly database: typeof db = db) {}
  async saveAll(updates: { guildId: string; settings: XpSettings }[]) {
    await this.database.transaction(async (tx) => {
      for (const { guildId, settings } of updates) {
        await tx.orm.public.GuildConfig.upsert({ create: { guildId, ...settings }, update: settings, conflictOn: { guildId } });
      }
    });
  }
}
