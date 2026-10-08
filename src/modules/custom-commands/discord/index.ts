import { discordEvent, type DiscordModule } from "../../../adapters/discord/modules.js";
import { CustomCommand } from "./commands/custom.js";
export { CustomCommand } from "./commands/custom.js";
export { openCustomCommandSettings } from "./settings.js";
export { registeredCommandNames, isBuiltInCommand } from "./reservedNames.js";
export { validateGuildReferences } from "./CustomCommandGuildValidator.js";
export * from "./runtime.js";
export * from "./legacyService.js";
import { customCommandsToken, customCommandRepositoryToken, sharingRepositoryToken } from "../index.js";
import { executorToken, sharingToken } from "./tokens.js";
import { CustomCommandExecutor } from "./CustomCommandExecutor.js";
import { CustomCommandSharingService } from "./CustomCommandSharingService.js";
import { createLegacyRunner, legacyRunnerToken, runCustomEvent } from "./legacyRunner.js";
import { guildOwnershipService } from "../../guilds/discord/index.js";
import { loggerToken } from "../../../core/index.js";
import { onCustomCommandMessage } from "./events.js";

export const discordModule: DiscordModule = {
  commands: { "custom": CustomCommand },
  register(context) {
    context.provide(executorToken, new CustomCommandExecutor(context.resolve(customCommandRepositoryToken), undefined, undefined, undefined, context.resolve(loggerToken)));
    context.provide(sharingToken, new CustomCommandSharingService(context.resolve(sharingRepositoryToken), context.resolve(customCommandsToken), (guild) => guildOwnershipService.isVerified(guild)));
    const legacy = createLegacyRunner();
    context.provide(legacyRunnerToken, legacy);
    context.onStop(() => legacy.stop());
  },
  events: [
    discordEvent("messageCreate", onCustomCommandMessage),
    discordEvent("guildMemberAdd", (member) => runCustomEvent("member_join", member), 1),
    discordEvent("guildMemberRemove", (member) => runCustomEvent("member_leave", member), 1),
  ],
};
