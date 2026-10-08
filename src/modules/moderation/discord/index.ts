import { discordEvent, type DiscordModule } from "../../../adapters/discord/modules.js";
import { BanCommand } from "./commands/ban.js";
import { CaseCommand } from "./commands/case.js";
import { HistoryCommand } from "./commands/history.js";
import { KickCommand } from "./commands/kick.js";
import { NoteCommand } from "./commands/note.js";
import { PurgeCommand } from "./commands/purge.js";
import { ReportCommand } from "./commands/report.js";
import { TimeoutCommand } from "./commands/timeout.js";
import { UnbanCommand } from "./commands/unban.js";
import { UnwarnCommand } from "./commands/unwarn.js";
import { WarnCommand } from "./commands/warn.js";
import { WarningsCommand } from "./commands/warnings.js";
export { BanCommand } from "./commands/ban.js";
export { CaseCommand } from "./commands/case.js";
export { HistoryCommand } from "./commands/history.js";
export { KickCommand } from "./commands/kick.js";
export { NoteCommand } from "./commands/note.js";
export { PurgeCommand } from "./commands/purge.js";
export { ReportCommand } from "./commands/report.js";
export { TimeoutCommand } from "./commands/timeout.js";
export { UnbanCommand } from "./commands/unban.js";
export { UnwarnCommand } from "./commands/unwarn.js";
export { WarnCommand } from "./commands/warn.js";
export { WarningsCommand } from "./commands/warnings.js";
export * from "./services.js";
export * from "./commandUtils.js";
export * from "./permissionGuards.js";
export * from "./renderer.js";
export * from "./warningRoleNames.js";
export { runWarn } from "./warn.js";
import { createWarningRoleLifecycle, warningLifecycleToken, restoreWarningRoleExpirations } from "./warningRoles.js";
import { loggerToken } from "../../../core/index.js";

export const discordModule: DiscordModule = {
  commands: { "ban": BanCommand, "case": CaseCommand, "history": HistoryCommand, "kick": KickCommand, "note": NoteCommand, "purge": PurgeCommand, "report": ReportCommand, "timeout": TimeoutCommand, "unban": UnbanCommand, "unwarn": UnwarnCommand, "warn": WarnCommand, "warnings": WarningsCommand },
  register(context) {
    const lifecycle = createWarningRoleLifecycle();
    context.provide(warningLifecycleToken, lifecycle);
    context.onStop(() => lifecycle.stop());
  },
  events: [discordEvent("clientReady", async (client) => { await restoreWarningRoleExpirations(client); })],
};
