import { Command } from "@sapphire/framework";
import {
  Colors,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  TimestampStyles,
  escapeMarkdown,
  time,
} from "discord.js";

type RegisteredChatInputCommand = {
  name: string;
  description?: string;
};

type RegistryApiCall = {
  builtData?: RegisteredChatInputCommand;
};

export class HelpCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("help")
        .setDescription("See all available bot commands"),
    );
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ) {
    const commands = this.getRegisteredChatInputCommands();

    const commandList =
      commands.length > 0
        ? commands
          .map(
            (command) =>
              `**/${escapeMarkdown(command.name)}**\n${escapeMarkdown(
                command.description || "No description available.",
              )}`,
          )
          .join("\n\n")
        : "No commands are available yet.";

    const header = new TextDisplayBuilder().setContent(
      [
        "## Help",
        `${commands.length} slash command${commands.length === 1 ? "" : "s"} available`,
      ].join("\n"),
    );

    const list = new TextDisplayBuilder().setContent(commandList);

    const footer = new TextDisplayBuilder().setContent(
      `-# Requested by ${escapeMarkdown(interaction.user.displayName)} • ${time(
        new Date(),
        TimestampStyles.RelativeTime,
      )}`,
    );

    const container = new ContainerBuilder()
      .setAccentColor(Colors.Blurple)
      .addTextDisplayComponents(header)
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Large),
      )
      .addTextDisplayComponents(list)
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(false)
          .setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(footer);

    await interaction.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });
  }

  private getRegisteredChatInputCommands() {
    const commandStore = this.container.stores.get("commands");

    return [...commandStore.values()]
      .flatMap((command) => {
        const registry = command.applicationCommandRegistry as unknown as {
          apiCalls?: RegistryApiCall[];
        };

        return (
          registry.apiCalls
            ?.map((call) => call.builtData)
            .filter((data): data is RegisteredChatInputCommand =>
              Boolean(data?.name),
            ) ?? []
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
