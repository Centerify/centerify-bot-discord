import { db } from "../../prisma/db.js";
import type { CreateModerationCaseInput } from "./types.js";

const defaultLimit = 10;
const maxCreateAttempts = 3;

export class ModerationCaseService {
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
    return db.orm.public.ModerationCase
      .where({ guildId, caseNumber })
      .first();
  }

  public recentForUser(guildId: string, targetUserId: string, limit = defaultLimit) {
    return db.orm.public.ModerationCase
      .where({ guildId, targetUserId })
      .orderBy((moderationCase) => moderationCase.createdAt.desc())
      .limit(limit)
      .all();
  }

  public recentWarningsForUser(
    guildId: string,
    targetUserId: string,
    limit = defaultLimit,
  ) {
    return db.orm.public.ModerationCase
      .where({ guildId, targetUserId, action: "WARNING" })
      .orderBy((moderationCase) => moderationCase.createdAt.desc())
      .limit(limit)
      .all();
  }

  public recentNotesForUser(
    guildId: string,
    targetUserId: string,
    limit = defaultLimit,
  ) {
    return db.orm.public.ModerationCase
      .where({ guildId, targetUserId, action: "NOTE" })
      .orderBy((moderationCase) => moderationCase.createdAt.desc())
      .limit(limit)
      .all();
  }

  public async countForUser(guildId: string, targetUserId: string) {
    const result = await db.orm.public.ModerationCase
      .where({ guildId, targetUserId })
      .aggregate((aggregate) => ({ count: aggregate.count() }));

    return result.count;
  }

  public async countWarningsForUser(guildId: string, targetUserId: string) {
    const result = await db.orm.public.ModerationCase
      .where({ guildId, targetUserId, action: "WARNING" })
      .aggregate((aggregate) => ({ count: aggregate.count() }));

    return result.count;
  }

  public async updateReason(guildId: string, caseNumber: number, reason: string) {
    await db.orm.public.ModerationCase
      .where({ guildId, caseNumber })
      .update({ reason });

    return this.findByCaseNumber(guildId, caseNumber);
  }

  private createCaseOnce(input: CreateModerationCaseInput) {
    return db.transaction(async (tx) => {
      const caseNumber = await this.allocateCaseNumber(tx, input.guildId);

      return tx.orm.public.ModerationCase.create({
        guildId: input.guildId,
        caseNumber,
        targetUserId: input.targetUserId,
        moderatorUserId: input.moderatorUserId,
        action: input.action,
        reason: input.reason,
        durationMs: input.durationMs ?? null,
        metadata: input.metadata ?? null,
      });
    });
  }

  private async allocateCaseNumber(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    guildId: string,
  ) {
    const rows = await tx.query(
      db.raw.sql`
        INSERT INTO "moderationCaseCounter" ("guildId", "nextCaseNumber", "createdAt", "updatedAt")
        VALUES (${guildId}, 2, now(), now())
        ON CONFLICT ("guildId") DO UPDATE
        SET "nextCaseNumber" = "moderationCaseCounter"."nextCaseNumber" + 1,
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
      error.constraint === "moderationCase_guildId_caseNumber_key"
    );
  }
}

export const moderationCaseService = new ModerationCaseService();
