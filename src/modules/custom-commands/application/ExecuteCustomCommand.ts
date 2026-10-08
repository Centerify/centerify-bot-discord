import { silentLogger, type Logger } from "../../../core/index.js";
import { CUSTOM_COMMAND_LIMITS as L } from "../domain/constants.js";
import { CustomCommandValidationError } from "../domain/errors.js";
import type { CommandExecutionIdentity, CustomCommandRepository } from "../domain/types.js";
import type { CustomCommandCooldownStore } from "./CustomCommandCooldownService.js";
export interface ExecutionContext extends CommandExecutionIdentity { args: string[]; source: "message" | "slash" | "button" | "internal" }
export interface ExecutionTransport<Payload> { send(payload: Payload, index: number): Promise<unknown>; deleteInvocation?(): Promise<unknown> }
export class ExecuteCustomCommand<Context extends ExecutionContext, Payload> {
  public constructor(
    private readonly repository: Pick<CustomCommandRepository, "recordUsage">,
    private readonly renderer: { render(context: Context, interactive: boolean): Promise<Payload[]> },
    private readonly permissions: { check(context: Context): void },
    private readonly cooldowns: CustomCommandCooldownStore,
    private readonly attachNavigation: (message: unknown, context: Context, responses: Payload[]) => void,
    private readonly logger: Logger = silentLogger,
  ) {}
  public async execute(
    context: Context,
    transport: ExecutionTransport<Payload>,
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
        if (staged) this.attachNavigation(message, context, responses);
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
            this.logger.warn(metadata, "custom_command.invocation_delete_failed"),
          );
      }
      // A metrics outage must not turn an already delivered response into a failure.
      await this.repository
        .recordUsage(
          context.command.sourceGuildId ?? context.guildId,
          context.command.id,
        )
        .catch(() => this.logger.warn(metadata, "custom_command.metrics_failed"));
      this.logger.info(
        { ...metadata, durationMs: Date.now() - started },
        "custom_command.executed",
      );
    } catch (error) {
      if (!sent) release?.();
      this.logger.warn(
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
