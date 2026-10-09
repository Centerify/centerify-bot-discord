import { trackCollector } from "../../../adapters/discord/resources.js";
import {
  MessageFlags,
  type Message,
  type MessageCreateOptions,
  type MessageEditOptions,
} from "discord.js";
import type { CustomCommandExecutionContext } from "../discord/types.js";
import { logger } from "../../../adapters/logging/runtime.js";
import type { ComponentAction, CustomCommandRecord } from "../domain/types.js";
import { CustomCommandError } from "../domain/errors.js";
import { executeRoleAction } from "./roleActions.js";

/** A collector belongs to one delivered message; it never executes arbitrary commands. */
export function attachStageNavigation(
  delivered: unknown,
  context: CustomCommandExecutionContext,
  payloads: MessageCreateOptions[],
  options: {
    responseIndex?: number;
    preview?: boolean;
    loadCommand?: () => Promise<CustomCommandRecord | undefined>;
  } = {},
): void {
  if (
    !delivered ||
    typeof (delivered as Message).createMessageComponentCollector !== "function"
  )
    return;
  const message = delivered as Message;
  const templates = context.command.content;
  let current =
    options.responseIndex ??
    templates.findIndex((template) => template.stage === 0);
  if (current < 0) current = 0;
  let busy = false;
  let closed = false;
  const collector = message.createMessageComponentCollector({
    time: 15 * 60_000,
    filter: (interaction) =>
      /^(cc-stage|cc-response|cc-select):/.test(interaction.customId),
  });
  trackCollector("custom-commands", collector);
  collector.on("collect", async (interaction) => {
    try {
      if (interaction.user.id !== context.userId) {
        await interaction.reply({
          content:
            "Only the person who ran this command can use these controls.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const match = /^(cc-stage|cc-response|cc-select):(\d+):(\d+)$/.exec(
        interaction.customId,
      );
      const template = templates[current];
      let action: ComponentAction | undefined;
      if (match && Number(match[2]) === (template.stage ?? current)) {
        if (match[1] === "cc-select" && interaction.isStringSelectMenu()) {
          const value =
            interaction.values.length === 1 ? interaction.values[0] : undefined;
          if (value !== undefined && /^(0|[1-9]\d*)$/.test(value))
            action =
              template.selects?.[Number(match[3])]?.options[Number(value)];
        } else if (
          match[1] ===
            (template.stage === undefined ? "cc-response" : "cc-stage") &&
          interaction.isButton()
        ) {
          const button = template.buttons?.[Number(match[3])];
          if (button && "action" in button) action = button;
        }
      }
      if (closed || busy || !action) {
        await interaction.deferUpdate();
        return;
      }
      busy = true;
      try {
        if ("roleId" in action) {
          if (options.preview) {
            await interaction.reply({
              content: "Preview only — roles are not changed.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          // A failed acknowledgement must never apply an action.
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          try {
            if (!options.loadCommand)
              throw new Error("Missing command authorization.");
            const content = await executeRoleAction(
              context,
              action,
              options.loadCommand,
              () => !closed,
            );
            await interaction.editReply({
              content,
              allowedMentions: { parse: [] },
            });
          } catch (error) {
            await interaction.editReply({
              content:
                error instanceof CustomCommandError
                  ? error.message
                  : "I could not change that role. Please try again.",
              allowedMentions: { parse: [] },
            });
          }
          return;
        }
        if (action.action === "cancel") {
          await interaction.update({ components: [] });
          collector.stop("cancelled");
          return;
        }
        const target =
          action.action === "main"
            ? 0
            : "target" in action
              ? action.target
              : undefined;
        const next = templates.findIndex(
          (template) => template.stage === target,
        );
        if (next < 0) {
          await interaction.deferUpdate();
          return;
        }
        const payload = payloads[next];
        await interaction.update({
          content: payload.content ?? null,
          embeds: payload.embeds ?? [],
          components: payload.components ?? [],
          allowedMentions: payload.allowedMentions,
        });
        current = next;
        if (closed) await message.edit({ components: [] });
      } finally {
        busy = false;
      }
    } catch (error) {
      logger.warn(
        { errorType: error instanceof Error ? error.name : "Unknown" },
        "custom_command.navigation_failed",
      );
    }
  });
  collector.on("end", () => {
    closed = true;
    void message
      .edit({ components: [] } satisfies MessageEditOptions)
      .catch(() => {});
  });
}
