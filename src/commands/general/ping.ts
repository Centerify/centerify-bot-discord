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
    await interaction.reply(`Pong ${user.displayName} !`);
  }
}
