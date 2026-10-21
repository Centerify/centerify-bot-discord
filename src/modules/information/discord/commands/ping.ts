import { replyToCommand } from "../../../../adapters/discord/interactions.js";
import { Command } from "@sapphire/framework";

export class PingCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("ping")
        .setDescription("Check whether the bot is responsive"),
    );
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ) {
    const user = interaction.user;
    await replyToCommand(interaction, `Pong ${user.displayName} !`);
  }
}
