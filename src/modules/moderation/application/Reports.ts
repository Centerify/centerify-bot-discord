import type { CreateReportInput, ReportStatus } from "../domain/types.js";
export interface MemberReport {
  id: number; guildId: string; reportNumber: number; reportedUserId: string; reporterUserId: string;
  reason: string; status: ReportStatus; reviewedBy: string | null; reviewedAt: string | null;
  createdAt: string; updatedAt: string;
}
export interface ReportRepository {
  createReport(input: CreateReportInput): Promise<MemberReport>;
  findByReportNumber(guildId: string, reportNumber: number): PromiseLike<MemberReport | null>;
  updateStatus(input: { guildId: string; reportNumber: number; status: Exclude<ReportStatus, "PENDING">; reviewedBy: string }): Promise<MemberReport | null>;
}
