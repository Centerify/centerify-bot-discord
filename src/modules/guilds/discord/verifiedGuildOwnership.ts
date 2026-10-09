import { Precondition } from "@sapphire/framework";
import type {
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  Message,
} from "discord.js";
import { MessageFlags } from "discord.js";
import { logger } from "../../../adapters/logging/runtime.js";
import {
  guildOwnershipService,
  OWNERSHIP_REQUIRED_MESSAGE,
  requireVerifiedOwnership,
} from "./ownership.js";

export class VerifiedGuildOwnershipPrecondition extends Precondition {
  public constructor(
    context: Precondition.LoaderContext,
    options: Precondition.Options,
  ) {
    super(context, { ...options, position: 0 });
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    if (
      interaction.commandName === "verify" ||
      interaction.commandName === "unverify"
    )
      return this.ok();
    // Ownership checks make REST and database requests before the command runs.
    if (
      ["settings", "setup", "custom"].includes(interaction.commandName) &&
      !interaction.deferred &&
      !interaction.replied
    ) {
      const acknowledgementStartedAt = Date.now();
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? error.code
            : undefined;
        if (code !== 10062 && code !== 40060) throw error;
        // Discord cannot accept another initial response. Stop before ownership
        // requests or command side effects; retrying the callback cannot recover it.
        // Log timing without the API error, which contains the interaction token.
        logger.warn(
          {
            code,
            commandName: interaction.commandName,
            interactionId: interaction.id,
            guildId: interaction.guildId,
            interactionAgeMs:
              acknowledgementStartedAt - interaction.createdTimestamp,
            acknowledgementDurationMs: Date.now() - acknowledgementStartedAt,
          },
          "Command acknowledgement rejected; interaction expired or already acknowledged",
        );
        return this.error({
          identifier: "InteractionUnavailable",
          message:
            "This interaction expired or was already acknowledged. Run the command again.",
        });
      }
    }
    return this.checkInteraction(interaction);
  }

  public override async contextMenuRun(
    interaction: ContextMenuCommandInteraction,
  ) {
    return this.checkInteraction(interaction);
  }

  public override async messageRun(message: Message) {
    if (
      message.guild &&
      (await guildOwnershipService.isVerified(message.guild))
    )
      return this.ok();
    return this.error({
      identifier: "GuildOwnershipRequired",
      message: OWNERSHIP_REQUIRED_MESSAGE,
    });
  }

  private async checkInteraction(
    interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction,
  ) {
    if (await requireVerifiedOwnership(interaction)) return this.ok();
    return this.error({
      identifier: "GuildOwnershipRequired",
      message: OWNERSHIP_REQUIRED_MESSAGE,
    });
  }
}
