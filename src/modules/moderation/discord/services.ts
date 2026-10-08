import { serviceRef } from "../../../adapters/discord/context.js";
import { moderationCasesToken, reportsToken, warnMemberKey } from "../index.js";
export const moderationCaseService = serviceRef(moderationCasesToken);
export const reportService = serviceRef(reportsToken);
export const warnMember = serviceRef(warnMemberKey);
