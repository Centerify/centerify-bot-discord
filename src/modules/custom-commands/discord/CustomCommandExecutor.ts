import { attachStageNavigation } from "./stageNavigation.js";
import { silentLogger, type Logger } from "../../../core/index.js";
import type { CustomCommandRepository } from "../domain/types.js";
import type {
  CustomCommandExecutionContext,
  CustomCommandTransport,
} from "./types.js";
import {
  CustomCommandCooldownService,
  type CustomCommandCooldownStore,
} from "../application/CustomCommandCooldownService.js";
import { ExecuteCustomCommand } from "../application/ExecuteCustomCommand.js";
import { CustomCommandPermissionService } from "./CustomCommandPermissionService.js";
import { CustomCommandRenderer } from "./CustomCommandRenderer.js";
import type { MessageCreateOptions } from "discord.js";
import { serviceRef } from "../../../adapters/discord/context.js";
import { sharingToken } from "./tokens.js";
import { ComponentActionExecutor } from "./ComponentActionExecutor.js";
export class CustomCommandExecutor {
  private readonly useCase: ExecuteCustomCommand<
    CustomCommandExecutionContext,
    MessageCreateOptions
  >;
  constructor(
    repository: CustomCommandRepository,
    renderer = new CustomCommandRenderer(),
    permissions = new CustomCommandPermissionService(),
    cooldowns: CustomCommandCooldownStore = new CustomCommandCooldownService(),
    logger: Logger = silentLogger,
    actions = new ComponentActionExecutor(),
  ) {
    this.useCase = new ExecuteCustomCommand(
      repository,
      renderer,
      permissions,
      cooldowns,
      (message, context, payloads, responseIndex) =>
        attachStageNavigation(message, context, payloads, {
          responseIndex,
          actionExecutor: actions,
          loadCommand: async () => {
            const saved = (
              await repository.list(
                context.command.sourceGuildId ?? context.guildId,
              )
            ).find((command) => command.id === context.command.id);
            if (!saved || !context.command.sourceGuildId) return saved;
            const shared = await serviceRef(sharingToken).resolve(
              context.guild.client,
              context.guild,
              context.command.name,
            );
            if (
              !shared ||
              shared.id !== saved.id ||
              shared.sourceGuildId !== saved.guildId
            )
              return undefined;
            return {
              ...saved,
              guildId: context.guildId,
              sourceGuildId: saved.guildId,
            };
          },
        }),
      logger,
    );
  }
  execute(
    context: CustomCommandExecutionContext,
    transport: CustomCommandTransport,
  ) {
    return this.useCase.execute(context, transport);
  }
}
