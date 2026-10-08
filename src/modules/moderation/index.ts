import { GlobalModeration } from "./application/GlobalModeration.js";
import { guildConfigToken } from "../guilds/index.js";
import { silentLogger, type Logger } from "../../core/index.js";
import { serviceToken, type CenterifyModule } from "../../core/index.js";
import { WarnMember } from "./application/WarnMember.js";
import { ModerationCases, type ModerationCaseRepository } from "./application/ModerationCases.js";
import type { ReportRepository } from "./application/Reports.js";
export { WarnMember } from "./application/WarnMember.js";
export type { WarningCase, WarningRepository, RecordWarningInput, WarnInput, WarningEffects, WarningResult } from "./application/WarnMember.js";
export { ModerationCases } from "./application/ModerationCases.js";
export type { ModerationCaseRepository } from "./application/ModerationCases.js";
export type { ReportRepository, MemberReport } from "./application/Reports.js";
export * from "./domain/types.js";
export * from "./domain/warningLifecycle.js";
export const moderationCasesToken = serviceToken<Pick<ModerationCases, keyof ModerationCases>>("moderation.cases");
export const reportsToken = serviceToken<ReportRepository>("moderation.reports");
export { GlobalModeration } from "./application/GlobalModeration.js";
export const globalModerationToken = serviceToken<Pick<GlobalModeration, keyof GlobalModeration>>("moderation.global");
export const warnMemberKey = serviceToken<Pick<WarnMember, keyof WarnMember>>("moderation.warnMember");
export function createModerationModule(options: { repository: ModerationCaseRepository; reports: ReportRepository; logger?: Logger; warnMember?: Pick<WarnMember, keyof WarnMember> }): CenterifyModule {
  return {
    metadata: { id: "moderation", name: "Moderation", version: "1.0.0", dependsOn: ["guilds"] },
    register(context) {
      const cases = new ModerationCases(options.repository);
      context.provide(moderationCasesToken, cases);
      context.provide(globalModerationToken, new GlobalModeration(context.resolve(guildConfigToken), options.logger ?? silentLogger));
      context.provide(reportsToken, options.reports);
      context.provide(warnMemberKey, options.warnMember ?? new WarnMember(cases));
    },
  };
}
