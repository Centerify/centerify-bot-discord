import { Command } from "@sapphire/framework";
import { InteractionContextType, MessageFlags } from "discord.js";
import { logger } from "../../logger.js";
import { guildOwnershipService } from "../../services/guildOwnershipService.js";

export class VerifyCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) => builder
      .setName("verify")
      .setDescription("As the server owner, authorize Centerify to work in this server")
      .setContexts(InteractionContextType.Guild));
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!interaction.guild) {
      await interaction.editReply("Ownership verification can only be used inside a server.");
      return;
    }
    try {
      const verified = await guildOwnershipService.verify(interaction.guild, interaction.user.id);
      await interaction.editReply(verified
        ? "Server ownership verified. You can now configure Centerify with `/settings`."
        : "Only the current server owner can verify ownership. Administrator permission is not sufficient.");
    } catch (error) {
      logger.error({ err: error, guildId: interaction.guildId }, "Failed to verify guild ownership");
      await interaction.editReply("I could not verify ownership right now. Please try again shortly.");
    }
  }
}
