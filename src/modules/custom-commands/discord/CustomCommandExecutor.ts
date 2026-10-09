import { attachStageNavigation } from "./stageNavigation.js";
import { silentLogger, type Logger } from "../../../core/index.js";
import type { CustomCommandRepository } from "../domain/types.js";
import type { CustomCommandExecutionContext, CustomCommandTransport } from "./types.js";
import { CustomCommandCooldownService, type CustomCommandCooldownStore } from "../application/CustomCommandCooldownService.js";
import { ExecuteCustomCommand } from "../application/ExecuteCustomCommand.js";
import { CustomCommandPermissionService } from "./CustomCommandPermissionService.js";
import { CustomCommandRenderer } from "./CustomCommandRenderer.js";
import type { MessageCreateOptions } from "discord.js";
export class CustomCommandExecutor {
  private readonly useCase: ExecuteCustomCommand<CustomCommandExecutionContext, MessageCreateOptions>;
  constructor(repository: CustomCommandRepository, renderer = new CustomCommandRenderer(), permissions = new CustomCommandPermissionService(), cooldowns: CustomCommandCooldownStore = new CustomCommandCooldownService(), logger: Logger = silentLogger) {
    this.useCase = new ExecuteCustomCommand(repository, renderer, permissions, cooldowns,
      (message, context, payloads, responseIndex) => attachStageNavigation(message, context, payloads, {
        responseIndex,
        loadCommand: async () => (await repository.list(context.command.sourceGuildId ?? context.guildId)).find((command) => command.id === context.command.id),
      }), logger);
  }
  execute(context: CustomCommandExecutionContext, transport: CustomCommandTransport) {
    return this.useCase.execute(context, transport);
  }
}
