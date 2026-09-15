import { db } from "../../prisma/db.js";
import type { CreateReportInput, ReportStatus } from "./types.js";

export class ReportService {
  public async createReport(input: CreateReportInput) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.createReportOnce(input);
      } catch (error) {
        if (!this.isReportNumberConflict(error) || attempt === 3) {
          throw error;
        }
      }
    }

    throw new Error("Failed to create report");
  }

  private async createReportOnce(input: CreateReportInput) {
    return db.transaction(async (tx) => {
      const reportNumber = await this.allocateReportNumber(tx, input.guildId);

      return tx.orm.public.MemberReport.create({
        guildId: input.guildId,
        reportNumber,
        reportedUserId: input.reportedUserId,
        reporterUserId: input.reporterUserId,
        reason: input.reason,
      });
    });
  }

  private async allocateReportNumber(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    guildId: string,
  ) {
    const rows = await tx.query(
      db.raw.sql`
        INSERT INTO "reportCounter" ("guildId", "nextReportNumber", "createdAt", "updatedAt")
        VALUES (${guildId}, 2, now(), now())
        ON CONFLICT ("guildId") DO UPDATE
        SET "nextReportNumber" = "reportCounter"."nextReportNumber" + 1,
            "updatedAt" = now()
        RETURNING "nextReportNumber" - 1 AS "reportNumber"
      `.returnsRow({ reportNumber: "pg/int4@1" }).build(),
    );

    const row = rows[0];
    if (!row) {
      throw new Error("Failed to allocate report number");
    }

    return row.reportNumber;
  }

  public findByReportNumber(guildId: string, reportNumber: number) {
    return db.orm.public.MemberReport.where({ guildId, reportNumber }).first();
  }

  public async updateStatus({
    guildId,
    reportNumber,
    status,
    reviewedBy,
  }: {
    guildId: string;
    reportNumber: number;
    status: Exclude<ReportStatus, "PENDING">;
    reviewedBy: string;
  }) {
    await db.orm.public.MemberReport
      .where({ guildId, reportNumber })
      .update({
        status,
        reviewedBy,
        reviewedAt: new Date().toISOString(),
      });

    return this.findByReportNumber(guildId, reportNumber);
  }

  private isReportNumberConflict(error: unknown) {
    if (!error || typeof error !== "object") {
      return false;
    }

    return (
      "sqlState" in error &&
      "constraint" in error &&
      error.sqlState === "23505" &&
      error.constraint === "memberReport_guildId_reportNumber_key"
    );
  }
}

export const reportService = new ReportService();
