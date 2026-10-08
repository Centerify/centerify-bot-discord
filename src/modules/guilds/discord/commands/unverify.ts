import { Command } from "@sapphire/framework";
import { InteractionContextType, MessageFlags } from "discord.js";
import { logger } from "../../../../adapters/logging/runtime.js";
import { guildOwnershipService } from "../ownership.js";

export class UnverifyCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) => builder
      .setName("unverify")
      .setDescription("As the server owner, revoke Centerify's authorization")
      .setContexts(InteractionContextType.Guild));
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!interaction.guild) {
      await interaction.editReply("Ownership verification can only be removed inside a server.");
      return;
    }
    try {
      const unverified = await guildOwnershipService.unverify(interaction.guild, interaction.user.id);
      await interaction.editReply(unverified
        ? "Server verification removed. Centerify commands are now disabled here until the current owner runs `/verify` again."
        : "Only the current server owner can remove verification. Administrator permission is not sufficient.");
    } catch (error) {
      logger.error({ err: error, guildId: interaction.guildId }, "Failed to remove guild ownership verification");
      await interaction.editReply("I could not remove verification right now. Please try again shortly.");
    }
  }
}
