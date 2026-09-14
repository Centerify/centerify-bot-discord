import { Command } from "@sapphire/framework";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
import { getRepositoryInfo } from "../../repositoryInfo.js";

export class InfoCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName("info").setDescription("See the bot's info"),
    );
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ) {
    const repo = await getRepositoryInfo();
    const repositoryLink = repo.repositoryUrl ?? null;

    const header = new TextDisplayBuilder().setContent(
      [
        `## ${escapeMarkdown(repo.name)}`,
        escapeMarkdown(repo.description),
        "",
        `Version ${escapeMarkdown(repo.version)}`,
      ].join("\n"),
    );

    const source = new TextDisplayBuilder().setContent(
      [
        "### Source",
        "",
        `**Branch**`,
        repo.branch ? `\`${escapeMarkdown(repo.branch)}\`` : "Unavailable",
        "",
        `**Latest commit**`,
        repo.commit ? `\`${escapeMarkdown(repo.commit)}\`` : "Unavailable",
        "",
        `**Commit message**`,
        repo.commitSubject ? escapeMarkdown(repo.commitSubject) : "Unavailable",
      ].join("\n"),
    );

    const build = new TextDisplayBuilder().setContent(
      [
        "### Build",
        "",
        `**Total commits**`,
        repo.commitCount === null ? "Unavailable" : repo.commitCount.toString(),
        "",
        `**Commit date**`,
        repo.commitDate
          ? [
            time(repo.commitDate, TimestampStyles.RelativeTime),
            `-# ${time(repo.commitDate, TimestampStyles.LongDateTime)}`,
          ].join("\n")
          : "Unavailable",
      ].join("\n"),
    );

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
      .addTextDisplayComponents(source)
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(false)
          .setSpacing(SeparatorSpacingSize.Large),
      )
      .addTextDisplayComponents(build);

    if (repositoryLink) {
      container
        .addSeparatorComponents(
          new SeparatorBuilder()
            .setDivider(true)
            .setSpacing(SeparatorSpacingSize.Large),
        )
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel("Open repository")
              .setStyle(ButtonStyle.Link)
              .setURL(repositoryLink),
          ),
        );
    }

    container
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(false)
          .setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(footer);

    await interaction.reply({
      components: [container],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
  }
}
