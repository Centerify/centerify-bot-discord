import { db } from "../../../adapters/prisma/client.js";
import type { CreateModerationCaseInput, JsonValue } from "../domain/types.js";
import type { ModerationCaseRepository } from "../application/ModerationCases.js";

const defaultLimit = 10;
const maxCreateAttempts = 3;

export class PrismaModerationCaseRepository implements ModerationCaseRepository {
  constructor(private readonly database: typeof db = db) {}
  public async updateMetadata(id: number, metadata: Record<string, JsonValue>) {
    await this.database.orm.public.ModerationCase.where({ id }).update({ metadata });
  }
  public async createCase(input: CreateModerationCaseInput) {
    for (let attempt = 1; attempt <= maxCreateAttempts; attempt += 1) {
      try {
        return await this.createCaseOnce(input);
      } catch (error) {
        if (!this.isCaseNumberConflict(error) || attempt === maxCreateAttempts) {
          throw error;
        }
      }
    }

    throw new Error("Failed to create moderation case");
  }

  public findByCaseNumber(guildId: string, caseNumber: number) {
    return this.database.orm.public.ModerationCase
      .where({ guildId, caseNumber })
      .first();
  }

  public recentForUser(guildId: string, targetUserId: string, limit = defaultLimit) {
    return this.database.orm.public.ModerationCase
      .where({ guildId, targetUserId })
      .orderBy((moderationCase) => moderationCase.createdAt.desc())
      .limit(limit)
      .all();
  }

  public warningsForRoleRestoration() {
    return this.database.orm.public.ModerationCase
      .where({ action: "WARNING" })
      .all();
  }

  public warningsForUser(guildId: string, targetUserId: string) {
    return this.database.orm.public.ModerationCase
      .where({ guildId, targetUserId, action: "WARNING" })
      .orderBy((moderationCase) => moderationCase.createdAt.desc())
      .all();
  }

  public recentNotesForUser(
    guildId: string,
    targetUserId: string,
    limit = defaultLimit,
  ) {
    return this.database.orm.public.ModerationCase
      .where({ guildId, targetUserId, action: "NOTE" })
      .orderBy((moderationCase) => moderationCase.createdAt.desc())
      .limit(limit)
      .all();
  }

  public recentGlobalNotesForUser(
    guildId: string,
    targetUserId: string,
    limit = defaultLimit,
  ) {
    return this.database.orm.public.ModerationCase
      .where({ guildId, targetUserId, action: "NOTE", isGlobal: true })
      .orderBy((moderationCase) => moderationCase.createdAt.desc())
      .limit(limit)
      .all();
  }

  public async countForUser(guildId: string, targetUserId: string) {
    const result = await this.database.orm.public.ModerationCase
      .where({ guildId, targetUserId })
      .aggregate((aggregate) => ({ count: aggregate.count() }));

    return result.count;
  }

  public async updateReason(guildId: string, caseNumber: number, reason: string) {
    await this.database.orm.public.ModerationCase
      .where({ guildId, caseNumber })
      .update({ reason });

    return this.findByCaseNumber(guildId, caseNumber);
  }

  private createCaseOnce(input: CreateModerationCaseInput) {
    return this.database.transaction(async (tx) => {
      const caseNumber = await this.allocateCaseNumber(tx, input.guildId);

      return tx.orm.public.ModerationCase.create({
        guildId: input.guildId,
        caseNumber,
        targetUserId: input.targetUserId,
        moderatorUserId: input.moderatorUserId,
        action: input.action,
        reason: input.reason,
        durationMs: input.durationMs ?? null,
        isGlobal: input.isGlobal ?? false,
        metadata: input.metadata ?? null,
      });
    });
  }

  private async allocateCaseNumber(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    guildId: string,
  ) {
    const rows = await tx.query(
      this.database.raw.sql`
        INSERT INTO moderation_case_counter ("guildId", "nextCaseNumber", "createdAt", "updatedAt")
        VALUES (${guildId}, 2, now(), now())
        ON CONFLICT ("guildId") DO UPDATE
        SET "nextCaseNumber" = moderation_case_counter."nextCaseNumber" + 1,
            "updatedAt" = now()
        RETURNING "nextCaseNumber" - 1 AS "caseNumber"
      `.returnsRow({ caseNumber: "pg/int4@1" }).build(),
    );

    const row = rows[0];
    if (!row) {
      throw new Error("Failed to allocate moderation case number");
    }

    return row.caseNumber;
  }

  private isCaseNumberConflict(error: unknown) {
    if (!error || typeof error !== "object") {
      return false;
    }

    return (
      "sqlState" in error &&
      "constraint" in error &&
      error.sqlState === "23505" &&
      error.constraint === "moderation_case_guildId_caseNumber_key"
    );
  }
}
