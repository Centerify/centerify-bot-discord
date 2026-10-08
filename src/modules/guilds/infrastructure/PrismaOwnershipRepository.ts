import { db } from "../../../adapters/prisma/client.js";
import type { OwnershipRepository } from "../application/VerifyGuildOwnership.js";

export class PrismaOwnershipRepository implements OwnershipRepository {
  constructor(private readonly database: typeof db = db) {}
  async ownerFor(guildId: string) {
    const row = await this.database.orm.public.GuildOwnership.where({ guildId }).first();
    return row?.ownerUserId ?? null;
  }
  async save(guildId: string, ownerUserId: string) {
    await this.database.orm.public.GuildOwnership.upsert({
      conflictOn: { guildId }, create: { guildId, ownerUserId },
      update: { ownerUserId, verifiedAt: new Date().toISOString() },
    });
  }
  async remove(guildId: string) {
    await this.database.orm.public.GuildOwnership.where({ guildId }).delete();
  }
}
