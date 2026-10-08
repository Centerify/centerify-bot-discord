import type { CreateModerationCaseInput, JsonValue } from "../domain/types.js";
import { isActiveWarning } from "../domain/warningLifecycle.js";
import type { WarningCase } from "./WarnMember.js";

export interface ModerationCaseRepository {
  createCase(input: CreateModerationCaseInput): Promise<WarningCase>;
  findByCaseNumber(guildId: string, caseNumber: number): PromiseLike<WarningCase | null>;
  recentForUser(guildId: string, targetUserId: string, limit?: number): PromiseLike<WarningCase[]>;
  warningsForUser(guildId: string, targetUserId: string): PromiseLike<WarningCase[]>;
  warningsForRoleRestoration(): PromiseLike<WarningCase[]>;
  recentNotesForUser(guildId: string, targetUserId: string, limit?: number): PromiseLike<WarningCase[]>;
  recentGlobalNotesForUser(guildId: string, targetUserId: string, limit?: number): PromiseLike<WarningCase[]>;
  countForUser(guildId: string, targetUserId: string): Promise<number>;
  updateMetadata(id: number, metadata: Record<string, JsonValue>): Promise<void>;
  updateReason(guildId: string, caseNumber: number, reason: string): Promise<WarningCase | null>;
}

export class ModerationCases {
  constructor(private readonly repository: ModerationCaseRepository, private readonly now: () => Date = () => new Date()) {}
  createCase(input: CreateModerationCaseInput) { return this.repository.createCase(input); }
  async findByCaseNumber(guildId: string, caseNumber: number) { return this.repository.findByCaseNumber(guildId, caseNumber); }
  async recentForUser(guildId: string, targetUserId: string, limit = 10) { return this.repository.recentForUser(guildId, targetUserId, limit); }
  async recentNotesForUser(guildId: string, targetUserId: string, limit = 10) { return this.repository.recentNotesForUser(guildId, targetUserId, limit); }
  async recentGlobalNotesForUser(guildId: string, targetUserId: string, limit = 10) { return this.repository.recentGlobalNotesForUser(guildId, targetUserId, limit); }
  countForUser(guildId: string, targetUserId: string) { return this.repository.countForUser(guildId, targetUserId); }
  async warningsForRoleRestoration() { return this.repository.warningsForRoleRestoration(); }
  async activeWarningsForUser(guildId: string, targetUserId: string) {
    const warnings = await this.repository.warningsForUser(guildId, targetUserId);
    return warnings.filter((warning) => isActiveWarning(warning, this.now()));
  }
  async recentWarningsForUser(guildId: string, targetUserId: string, limit = 10) {
    return (await this.activeWarningsForUser(guildId, targetUserId)).slice(0, limit);
  }
  async countWarningsForUser(guildId: string, targetUserId: string) {
    return (await this.activeWarningsForUser(guildId, targetUserId)).length;
  }
  async revokeActiveWarning(input: { guildId: string; targetUserId: string; moderatorUserId: string; reason: string; caseNumber?: number | null }) {
    const active = await this.activeWarningsForUser(input.guildId, input.targetUserId);
    const warning = input.caseNumber ? active.find((entry) => entry.caseNumber === input.caseNumber) : active[0];
    if (!warning) return null;
    const metadata = warning.metadata && typeof warning.metadata === "object" && !Array.isArray(warning.metadata)
      ? warning.metadata as Record<string, JsonValue> : {};
    await this.repository.updateMetadata(warning.id, {
      ...metadata, warningRevokedAt: this.now().toISOString(),
      warningRevokedBy: input.moderatorUserId, warningRevocationReason: input.reason,
    });
    return this.findByCaseNumber(input.guildId, warning.caseNumber);
  }
  updateReason(guildId: string, caseNumber: number, reason: string) {
    return this.repository.updateReason(guildId, caseNumber, reason);
  }
}
