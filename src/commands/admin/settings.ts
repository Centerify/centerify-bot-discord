import { Command } from "@sapphire/framework";
import {
  Colors,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../../logger.js";
import { guildConfigService } from "../../services/guildConfigService.js";
import { canManageServer } from "../../services/setup/guards.js";

export class SettingsCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("settings")
        .setDescription("Show this server's Centerify configuration")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setContexts(InteractionContextType.Guild),
    );
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: "This command can only be used inside a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!canManageServer(interaction.member)) {
      await interaction.reply({
        content: "You need Manage Server permission to view settings.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const config = await guildConfigService.getOrCreate(interaction.guildId).catch((error) => {
      logger.error({ err: error, guildId: interaction.guildId }, "Failed to load settings");
      return null;
    });

    if (!config) {
      await interaction.reply({
        content: "I could not load this server's settings right now.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.Blurple)
          .setTitle("Centerify Settings")
          .setAuthor({
            name: interaction.guild.name,
            iconURL: interaction.guild.iconURL({ size: 128 }) ?? undefined,
          })
          .addFields(
            {
              name: "Setup",
              value: config.setupCompleted ? "Complete" : "Not complete",
              inline: true,
            },
            {
              name: "Welcome",
              value: this.feature(config.welcomeEnabled, config.welcomeChannelId),
              inline: true,
            },
            {
              name: "Goodbye",
              value: this.feature(config.goodbyeEnabled, config.goodbyeChannelId),
              inline: true,
            },
            {
              name: "Auto Role",
              value: config.autoRoleEnabled
                ? config.autoRoleId ? `<@&${config.autoRoleId}>` : "On, no role"
                : "Off",
              inline: true,
            },
            {
              name: "Logging",
              value: this.feature(config.loggingEnabled, config.loggingChannelId),
              inline: true,
            },
          )
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  private feature(enabled: boolean, channelId: string | null) {
    if (!enabled) {
      return "Off";
    }

    return channelId ? `On - <#${channelId}>` : "On, no channel";
  }
}
