import { serviceToken, silentLogger, type CenterifyModule, type Logger } from "../../core/index.js";
import { CustomCommandService } from "./application/CustomCommandService.js";
import { CustomResponseService } from "./application/CustomResponseService.js";
import type { CustomCommandDefinition, CustomCommandRepository } from "./domain/types.js";
import type { LegacyResponseRepository } from "./domain/legacy.js";
import type { SharingRepository } from "./application/CommandSharingService.js";
import { CUSTOM_COMMAND_LIMITS, PROTECTED_COMMAND_NAMES } from "./domain/constants.js";
export { CustomCommandService, exportDefinition } from "./application/CustomCommandService.js";
export { CustomResponseService } from "./application/CustomResponseService.js";
export { ExecuteCustomCommand } from "./application/ExecuteCustomCommand.js";
export { CommandSharingService } from "./application/CommandSharingService.js";
export type { SharingRepository } from "./application/CommandSharingService.js";
export * from "./domain/types.js";
export * from "./domain/legacy.js";
export * from "./domain/constants.js";
export * from "./domain/errors.js";
export const customCommandsToken = serviceToken<Pick<CustomCommandService, keyof CustomCommandService>>("custom-commands.service");
export const legacyResponsesToken = serviceToken<Pick<CustomResponseService, keyof CustomResponseService>>("custom-commands.legacy");
export const customCommandRepositoryToken = serviceToken<CustomCommandRepository>("custom-commands.repository");
export const sharingRepositoryToken = serviceToken<SharingRepository>("custom-commands.sharingRepository");
export function createCustomCommandsModule(options: {
  repository: CustomCommandRepository; legacy: LegacyResponseRepository; sharing: SharingRepository;
  logger?: Logger; reservedNames?: () => Iterable<string>;
  validateReferences?: (guildId: string, definitions: CustomCommandDefinition[]) => Promise<void>;
}): CenterifyModule {
  return {
    metadata: { id: "custom-commands", name: "Custom commands", version: "1.0.0", dependsOn: ["guilds"] },
    register(context) {
      const config = context.config as { maxCommands?: unknown; maxLegacyResponses?: unknown } | undefined;
      if (config !== undefined && (!config || typeof config !== "object" || Array.isArray(config))) throw new Error("custom-commands config must be an object");
      const maxCommands = config?.maxCommands ?? CUSTOM_COMMAND_LIMITS.commandsPerGuild;
      const maxLegacy = config?.maxLegacyResponses ?? 25;
      if (typeof maxCommands !== "number" || !Number.isInteger(maxCommands) || maxCommands < 1 || typeof maxLegacy !== "number" || !Number.isInteger(maxLegacy) || maxLegacy < 1) throw new Error("Custom command limits must be positive integers");
      const names = options.reservedNames ?? (() => PROTECTED_COMMAND_NAMES);
      context.provide(customCommandRepositoryToken, options.repository);
      context.provide(sharingRepositoryToken, options.sharing);
      context.provide(customCommandsToken, new CustomCommandService(options.repository, undefined, names, maxCommands, options.validateReferences, options.logger ?? silentLogger));
      context.provide(legacyResponsesToken, new CustomResponseService(options.legacy, (name) => [...PROTECTED_COMMAND_NAMES, ...names()].includes(name), maxLegacy));
    },
  };
}
