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
import { greetingService } from "../../services/greetingService.js";
import {
  canManageServer,
  canSendToChannel,
  isUsableTextChannel,
} from "../../services/setup/guards.js";

export class WelcomeCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("welcome")
        .setDescription("Manage welcome messages")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setContexts(InteractionContextType.Guild)
        .addSubcommand((command) =>
          command.setName("status").setDescription("Show welcome settings"),
        )
        .addSubcommand((command) =>
          command.setName("enable").setDescription("Enable welcome messages"),
        )
        .addSubcommand((command) =>
          command.setName("disable").setDescription("Disable welcome messages"),
        )
        .addSubcommand((command) =>
          command
            .setName("channel")
            .setDescription("Set the welcome channel")
            .addChannelOption((option) =>
              option
                .setName("channel")
                .setDescription("The text channel for welcome messages")
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true),
            ),
        )
        .addSubcommand((command) =>
          command
            .setName("message")
            .setDescription("Set the welcome message template")
            .addStringOption((option) =>
              option
                .setName("message")
                .setDescription("Message template")
                .setMinLength(1)
                .setMaxLength(1_500)
                .setRequired(true),
            ),
        )
        .addSubcommand((command) =>
          command.setName("test").setDescription("Preview the welcome message"),
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
      await interaction.reply({ content: "You need Manage Server permission to manage welcome messages.", flags: MessageFlags.Ephemeral });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === "enable") {
        const config = await guildConfigService.update(interaction.guildId, { welcomeEnabled: true });
        await this.replyStatus(interaction, config, "Welcome messages enabled.");
        return;
      }

      if (subcommand === "disable") {
        const config = await guildConfigService.update(interaction.guildId, { welcomeEnabled: false });
        await this.replyStatus(interaction, config, "Welcome messages disabled.");
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
          welcomeChannelId: channel.id,
        });
        await this.replyStatus(interaction, config, "Welcome channel updated.");
        return;
      }

      if (subcommand === "message") {
        const message = interaction.options.getString("message", true).trim();
        const config = await guildConfigService.update(interaction.guildId, {
          welcomeMessage: message,
        });
        await this.replyStatus(interaction, config, "Welcome message updated.");
        return;
      }

      const config = await guildConfigService.getOrCreate(interaction.guildId);
      if (subcommand === "test") {
        await interaction.reply({
          content: greetingService.renderWelcome(config, interaction.member),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await this.replyStatus(interaction, config);
    } catch (error) {
      logger.error({ err: error, guildId: interaction.guildId }, "Welcome command failed");
      await interaction.reply({
        content: "I could not update welcome settings right now.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  private async replyStatus(
    interaction: Command.ChatInputCommandInteraction<"cached">,
    config: Awaited<ReturnType<typeof guildConfigService.getOrCreate>>,
    title = "Welcome Settings",
  ) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.Blurple)
          .setTitle(title)
          .addFields(
            { name: "Status", value: config.welcomeEnabled ? "On" : "Off", inline: true },
            {
              name: "Channel",
              value: config.welcomeChannelId ? `<#${config.welcomeChannelId}>` : "Not configured",
              inline: true,
            },
            { name: "Message", value: `\`\`\`\n${config.welcomeMessage.replaceAll("```", "`\u200b``")}\n\`\`\`` },
          )
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}
