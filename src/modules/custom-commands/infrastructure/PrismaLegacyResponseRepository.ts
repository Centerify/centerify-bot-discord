import { LegacyNameConflict } from "../domain/legacy.js";
import { db } from "../../../adapters/prisma/client.js";
import type { LegacyResponseRepository, LegacyResponseTransaction } from "../domain/legacy.js";
export class PrismaLegacyResponseRepository implements LegacyResponseRepository {
  constructor(private readonly database: typeof db = db) {}
  async list(guildId: string) { return this.database.orm.public.CustomResponse.where({ guildId }).all(); }
  async find(guildId: string, name: string) { return this.database.orm.public.CustomResponse.where({ guildId, name }).first(); }
  async mutate<T>(guildId: string, operation: (tx: LegacyResponseTransaction) => Promise<T>): Promise<T> {
    return this.database.transaction(async (tx) => {
      await tx.query(this.database.raw.sql`
        SELECT 1 AS locked
        FROM pg_advisory_xact_lock(hashtextextended(${`centerify:custom-responses:${guildId}`}, 0))
      `.returnsRow({ locked: "pg/int4@1" }).build());
      return operation({
        modernNames: async () => (await tx.orm.public.CustomCommandName.where({ guildId }).all()).map((entry) => entry.name),
        list: async () => tx.orm.public.CustomResponse.where({ guildId }).all(),
        create: async (input) => tx.orm.public.CustomResponse.create(input),
      });
    }).catch((error: unknown) => {
      if (error && typeof error === "object" && "sqlState" in error && "constraint" in error &&
        error.sqlState === "23505" && error.constraint === "custom_response_guildId_name_key") {
        throw new LegacyNameConflict("A response with that name already exists.");
      }
      throw error;
    });
  }
  async remove(guildId: string, name: string) { await this.database.orm.public.CustomResponse.where({ guildId, name }).delete(); }
  async update(guildId: string, name: string, values: { enabled?: boolean; response?: string }) {
    await this.database.orm.public.CustomResponse.where({ guildId, name }).update(values);
  }
}
