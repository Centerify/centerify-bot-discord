import {
  ComponentType,
  MessageFlags,
  type Message,
  type MessageCreateOptions,
  type MessageEditOptions,
} from "discord.js";
import type { CustomCommandExecutionContext } from "../../lib/customCommands/types.js";
import { logger } from "../../logger.js";

/** A collector belongs to one delivered message; it never executes arbitrary commands. */
export function attachStageNavigation(
  delivered: unknown,
  context: CustomCommandExecutionContext,
  payloads: MessageCreateOptions[],
): void {
  if (
    !delivered ||
    typeof (delivered as Message).createMessageComponentCollector !== "function"
  )
    return;
  const message = delivered as Message;
  const templates = context.command.content;
  let current = templates.findIndex((template) => template.stage === 0);
  let busy = false;
  let closed = false;
  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 15 * 60_000,
    filter: (interaction) => interaction.customId.startsWith("cc-stage:"),
  });
  collector.on("collect", async (interaction) => {
    try {
      if (interaction.user.id !== context.userId) {
        await interaction.reply({
          content:
            "Only the person who ran this command can use these buttons.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const match = /^cc-stage:(\d+):(\d+)$/.exec(interaction.customId);
      const button =
        match && Number(match[1]) === templates[current].stage
          ? templates[current].buttons?.[Number(match[2])]
          : undefined;
      if (closed || busy || !button || !("action" in button)) {
        await interaction.deferUpdate();
        return;
      }
      busy = true;
      try {
        if (button.action === "cancel") {
          await interaction.update({ components: [] });
          collector.stop("cancelled");
          return;
        }
        const target = button.action === "main" ? 0 : button.target;
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
