import { Command } from "@sapphire/framework";
import {
  ChannelType,
  Colors,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../../logger.js";
import { guildConfigService } from "../../services/guildConfigService.js";
import {
  canManageServer,
  canSendToChannel,
  isUsableTextChannel,
} from "../../services/setup/guards.js";

export class LoggingCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("logging")
        .setDescription("Manage Centerify logging")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setContexts(InteractionContextType.Guild)
        .addSubcommand((command) =>
          command.setName("status").setDescription("Show logging settings"),
        )
        .addSubcommand((command) =>
          command.setName("enable").setDescription("Enable logging"),
        )
        .addSubcommand((command) =>
          command.setName("disable").setDescription("Disable logging"),
        )
        .addSubcommand((command) =>
          command
            .setName("channel")
            .setDescription("Set the logging channel")
            .addChannelOption((option) =>
              option
                .setName("channel")
                .setDescription("The text channel for logs")
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true),
            ),
        ),
    );
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: "This command can only be used inside a server.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (!canManageServer(interaction.member)) {
      await interaction.reply({ content: "You need Manage Server permission to manage logging.", flags: MessageFlags.Ephemeral });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === "enable") {
        const config = await guildConfigService.update(interaction.guildId, { loggingEnabled: true });
        await this.replyStatus(interaction, config, "Logging enabled.");
        return;
      }

      if (subcommand === "disable") {
        const config = await guildConfigService.update(interaction.guildId, { loggingEnabled: false });
        await this.replyStatus(interaction, config, "Logging disabled.");
        return;
      }

      if (subcommand === "channel") {
        const channel = interaction.options.getChannel("channel", true);
        if (!isUsableTextChannel(channel) || !canSendToChannel(interaction.guild, channel)) {
          await interaction.reply({
            content: "Please choose a text channel I can view and send messages in.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const config = await guildConfigService.update(interaction.guildId, {
          loggingChannelId: channel.id,
        });
        await this.replyStatus(interaction, config, "Logging channel updated.");
        return;
      }

      const config = await guildConfigService.getOrCreate(interaction.guildId);
      await this.replyStatus(interaction, config);
    } catch (error) {
      logger.error({ err: error, guildId: interaction.guildId }, "Logging command failed");
      await interaction.reply({
        content: "I could not update logging settings right now.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  private async replyStatus(
    interaction: Command.ChatInputCommandInteraction<"cached">,
    config: Awaited<ReturnType<typeof guildConfigService.getOrCreate>>,
    title = "Logging Settings",
  ) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.Blurple)
          .setTitle(title)
          .addFields(
            { name: "Status", value: config.loggingEnabled ? "On" : "Off", inline: true },
            {
              name: "Channel",
              value: config.loggingChannelId ? `<#${config.loggingChannelId}>` : "Not configured",
              inline: true,
            },
          )
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}
