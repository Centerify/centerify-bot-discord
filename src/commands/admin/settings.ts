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
import {
  guildConfigService,
  type GuildConfigUpdate,
} from "../../services/guildConfigService.js";
import {
  canManageServer,
  canSendToChannel,
  isUsableTextChannel,
  validateAssignableRole,
} from "../../services/setup/guards.js";

export class SettingsCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("settings")
        .setDescription("View or update this server's Centerify configuration")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setContexts(InteractionContextType.Guild)
        .addBooleanOption((option) =>
          option
            .setName("global-ban")
            .setDescription("Enable or disable global bans for this server")
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option.setName("welcome-enabled").setDescription("Enable or disable welcome messages").setRequired(false),
        )
        .addChannelOption((option) =>
          option
            .setName("welcome-channel")
            .setDescription("Channel for welcome messages")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        )
        .addStringOption((option) =>
          option.setName("welcome-message").setDescription("Welcome message template").setMinLength(1).setMaxLength(1_500).setRequired(false),
        )
        .addBooleanOption((option) =>
          option.setName("goodbye-enabled").setDescription("Enable or disable goodbye messages").setRequired(false),
        )
        .addChannelOption((option) =>
          option
            .setName("goodbye-channel")
            .setDescription("Channel for goodbye messages")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        )
        .addStringOption((option) =>
          option.setName("goodbye-message").setDescription("Goodbye message template").setMinLength(1).setMaxLength(1_500).setRequired(false),
        )
        .addBooleanOption((option) =>
          option.setName("auto-role-enabled").setDescription("Enable or disable automatic role assignment").setRequired(false),
        )
        .addRoleOption((option) =>
          option.setName("auto-role").setDescription("Role to assign to new members").setRequired(false),
        )
        .addBooleanOption((option) =>
          option.setName("logging-enabled").setDescription("Enable or disable server logging").setRequired(false),
        )
        .addChannelOption((option) =>
          option
            .setName("logging-channel")
            .setDescription("Channel for server logs")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName("global-warn")
            .setDescription("Enable or disable global warnings for this server")
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName("global-note")
            .setDescription("Enable or disable global notes for this server")
            .setRequired(false),
        ),
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
        content: "You need Manage Server permission to manage settings.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const updates: GuildConfigUpdate = {
      ...(interaction.options.getBoolean("global-ban") === null
        ? {}
        : { globalBanEnabled: interaction.options.getBoolean("global-ban", true) }),
      ...(interaction.options.getBoolean("global-warn") === null
        ? {}
        : { globalWarnEnabled: interaction.options.getBoolean("global-warn", true) }),
      ...(interaction.options.getBoolean("global-note") === null
        ? {}
        : { globalNoteEnabled: interaction.options.getBoolean("global-note", true) }),
    };
    const channelOptions = [
      ["welcome-channel", "welcomeChannelId"],
      ["goodbye-channel", "goodbyeChannelId"],
      ["logging-channel", "loggingChannelId"],
    ] as const;

    for (const [optionName, fieldName] of channelOptions) {
      const channel = interaction.options.getChannel(optionName);
      if (!channel) continue;
      if (!isUsableTextChannel(channel) || !canSendToChannel(interaction.guild, channel)) {
        await interaction.reply({
          content: `Choose a text channel I can view and send messages in for ${optionName.replace("-", " ")}.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      updates[fieldName] = channel.id;
    }

    const autoRole = interaction.options.getRole("auto-role");
    if (autoRole) {
      const roleError = validateAssignableRole(interaction.guild, autoRole);
      if (roleError) {
        await interaction.reply({ content: roleError, flags: MessageFlags.Ephemeral });
        return;
      }
      updates.autoRoleId = autoRole.id;
    }

    const booleanOptions = [
      ["welcome-enabled", "welcomeEnabled"],
      ["goodbye-enabled", "goodbyeEnabled"],
      ["auto-role-enabled", "autoRoleEnabled"],
      ["logging-enabled", "loggingEnabled"],
    ] as const;
    for (const [optionName, fieldName] of booleanOptions) {
      const value = interaction.options.getBoolean(optionName);
      if (value !== null) updates[fieldName] = value;
    }

    const messageOptions = [
      ["welcome-message", "welcomeMessage"],
      ["goodbye-message", "goodbyeMessage"],
    ] as const;
    for (const [optionName, fieldName] of messageOptions) {
      const value = interaction.options.getString(optionName);
      if (value !== null) {
        const message = value.trim();
        if (!message) {
          await interaction.reply({ content: `${optionName.replace("-", " ")} cannot be empty.`, flags: MessageFlags.Ephemeral });
          return;
        }
        updates[fieldName] = message;
      }
    }

    const changed = Object.keys(updates).length > 0;
    const config = await (changed
      ? guildConfigService.update(interaction.guildId, updates)
      : guildConfigService.getOrCreate(interaction.guildId)
    ).catch((error) => {
      logger.error({ err: error, guildId: interaction.guildId }, "Failed to load or update settings");
      return null;
    });

    if (!config) {
      await interaction.reply({
        content: "I could not load or update this server's settings right now.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      content: changed ? "Server settings updated." : undefined,
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
              name: "Welcome Message",
              value: this.preview(config.welcomeMessage),
            },
            {
              name: "Goodbye",
              value: this.feature(config.goodbyeEnabled, config.goodbyeChannelId),
              inline: true,
            },
            {
              name: "Goodbye Message",
              value: this.preview(config.goodbyeMessage),
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
            {
              name: "Global Ban",
              value: config.globalBanEnabled ? "On" : "Off",
              inline: true,
            },
            {
              name: "Global Warn",
              value: config.globalWarnEnabled ? "On" : "Off",
              inline: true,
            },
            {
              name: "Global Note",
              value: config.globalNoteEnabled ? "On" : "Off",
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

  private preview(message: string) {
    const safe = message.replaceAll("```", "`\u200b``");
    return safe.length > 1_000 ? `${safe.slice(0, 997)}...` : safe;
  }
}
