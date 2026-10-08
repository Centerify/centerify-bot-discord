import { attachStageNavigation } from "./stageNavigation.js";
import { logger } from "../../logger.js";
import { CUSTOM_COMMAND_LIMITS as L } from "../../lib/customCommands/constants.js";
import { CustomCommandValidationError } from "../../lib/customCommands/errors.js";
import type {
  CustomCommandExecutionContext,
  CustomCommandRepository,
  CustomCommandTransport,
} from "../../lib/customCommands/types.js";
import {
  CustomCommandCooldownService,
  type CustomCommandCooldownStore,
} from "./CustomCommandCooldownService.js";
import { CustomCommandPermissionService } from "./CustomCommandPermissionService.js";
import { CustomCommandRenderer } from "./CustomCommandRenderer.js";
export class CustomCommandExecutor {
  public constructor(
    private readonly repository: CustomCommandRepository,
    private readonly renderer = new CustomCommandRenderer(),
    private readonly permissions = new CustomCommandPermissionService(),
    private readonly cooldowns: CustomCommandCooldownStore = new CustomCommandCooldownService(),
  ) {}
  public async execute(
    context: CustomCommandExecutionContext,
    transport: CustomCommandTransport,
  ): Promise<void> {
    const started = Date.now();
    const metadata = {
      guildId: context.guildId,
      commandId: context.command.id,
      commandName: context.command.name,
      userId: context.userId,
      source: context.source,
    };
    let release: (() => void) | undefined;
    let sent = 0;
    try {
      this.permissions.check(context);
      if (
        context.args.length > L.arguments ||
        context.args.some((arg) => typeof arg !== "string") ||
        context.args.join(" ").length > L.argumentInput
      )
        throw new CustomCommandValidationError(
          "Command arguments exceed the limits.",
        );
      release = this.cooldowns.acquire(context);
      const responses = await this.renderer.render(context, true);
      const staged = context.command.content.some(
        (response) => response.stage !== undefined,
      );
      for (const [index, payload] of responses.entries()) {
        if (staged && context.command.content[index].stage !== 0) continue;
        const message = await transport.send(payload, staged ? 0 : index);
        if (staged) attachStageNavigation(message, context, responses);
        sent++;
      }
      if (
        context.source === "message" &&
        context.command.deleteInvocation &&
        transport.deleteInvocation
      ) {
        await transport
          .deleteInvocation()
          .catch(() =>
            logger.warn(metadata, "custom_command.invocation_delete_failed"),
          );
      }
      // A metrics outage must not turn an already delivered response into a failure.
      await this.repository
        .recordUsage(
          context.command.sourceGuildId ?? context.guildId,
          context.command.id,
        )
        .catch(() => logger.warn(metadata, "custom_command.metrics_failed"));
      logger.info(
        { ...metadata, durationMs: Date.now() - started },
        "custom_command.executed",
      );
    } catch (error) {
      if (!sent) release?.();
      logger.warn(
        {
          ...metadata,
          durationMs: Date.now() - started,
          errorType: error instanceof Error ? error.name : "Unknown",
          sent,
        },
        "custom_command.failed",
      );
      throw error;
    }
  }
}
