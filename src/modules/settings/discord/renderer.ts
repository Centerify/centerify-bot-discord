import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  Colors,
  EmbedBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  type Guild,
} from "discord.js";
import {
  DEFAULT_GOODBYE_MESSAGE,
  DEFAULT_WELCOME_MESSAGE,
  type GuildConfig,
} from "../../guilds/discord/index.js";
import { XP_METHOD_CHOICES } from "../../xp/index.js";
import { formatGreetingVariableList } from "../../welcome/discord/index.js";
import { validateAssignableRole } from "../../guilds/discord/index.js";
import type { SetupScreen, SetupView } from "./types.js";

export class SetupRenderer {
  public constructor(private readonly entryCommand: "settings" | "setup" = "settings", public readonly isAvailable: (action: string) => boolean = () => true) {}

  public buildScreen(
    screen: SetupScreen,
    guild: Guild,
    config: GuildConfig,
    sessionId: string,
  ): SetupView {
    if (!this.isAvailable(screen)) return this.buildMainScreen(guild, config, sessionId);
    switch (screen) {
      case "xp":
        return this.buildXpScreen(guild, config, sessionId);
      case "welcome":
        return this.buildWelcomeScreen(guild, config, sessionId);
      case "welcome-variables":
        return this.buildVariablesScreen(guild, sessionId, "welcome");
      case "goodbye":
        return this.buildGoodbyeScreen(guild, config, sessionId);
      case "goodbye-variables":
        return this.buildVariablesScreen(guild, sessionId, "goodbye");
      case "autorole":
        return this.buildAutoRoleScreen(guild, config, sessionId);
      case "logging":
        return this.buildLoggingScreen(guild, config, sessionId);
      case "moderation":
        return this.buildModerationScreen(guild, config, sessionId);
      case "main":
        return this.buildMainScreen(guild, config, sessionId);
    }
  }

  public buildFinishScreen(guild: Guild, config: GuildConfig): SetupView {
    const disabled = [
      !config.welcomeEnabled || !config.welcomeChannelId ? "Welcome messages" : null,
      !config.goodbyeEnabled || !config.goodbyeChannelId ? "Goodbye messages" : null,
      !config.autoRoleEnabled || !config.autoRoleId ? "Auto role" : null,
      !config.loggingEnabled || !config.loggingChannelId ? "Logging" : null,
    ].filter((item): item is string => Boolean(item));

    const embed = this.baseEmbed(guild)
      .setTitle(this.entryCommand === "setup" ? "Setup Complete" : "Settings Saved")
      .setDescription(this.setupSummary(config))
      .addFields(
        {
          name: "Needs Attention",
          value: disabled.length > 0 ? disabled.join("\n") : "All setup categories are configured.",
        },
      );

    return { embeds: [embed], components: [] };
  }

  public buildExpiredScreen(guild: Guild, config: GuildConfig): SetupView {
    return {
      embeds: [
        this.baseEmbed(guild)
          .setTitle(this.entryCommand === "setup" ? "Setup Session Expired" : "Settings Session Expired")
          .setDescription(`${this.setupSummary(config)}\n\nRun \`/${this.entryCommand}\` again to make more changes.`),
      ],
      components: [],
    };
  }

  private buildMainScreen(
    guild: Guild,
    config: GuildConfig,
    sessionId: string,
  ): SetupView {
    const embed = this.baseEmbed(guild)
      .setTitle(this.entryCommand === "setup" ? "Centerify Server Setup" : "Centerify Server Settings")
      .setDescription(this.setupSummary(config))
      .addFields(
        {
          name: "Configure",
          value: [
            "`XP` earning methods, rewards, sharing, and multiple servers",
            "`Welcome` join messages",
            "`Goodbye` leave messages",
            "`Auto Role` new member role",
            "`Logging` server log channel",
            "`Global Moderation` shared bans, warnings, and notes",
            ...(this.entryCommand === "settings" ? ["`Custom Commands` responses and global or selected-server scope"] : []),
          ].join("\n"),
        },
      );

    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          this.button(sessionId, "welcome", "Welcome", ButtonStyle.Primary),
          this.button(sessionId, "goodbye", "Goodbye", ButtonStyle.Primary),
          this.button(sessionId, "autorole", "Auto Role", ButtonStyle.Primary),
          this.button(sessionId, "logging", "Logging", ButtonStyle.Primary),
          this.button(sessionId, "moderation", "Global Moderation", ButtonStyle.Primary),
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          this.button(sessionId, "xp", "XP", ButtonStyle.Primary),
          ...(this.entryCommand === "settings" ? [this.button(sessionId, "custom-commands", "Custom Commands", ButtonStyle.Primary)] : []),
          this.button(sessionId, "finish", "Done", ButtonStyle.Success),
        ),
      ].map((row) => new ActionRowBuilder<ButtonBuilder>().addComponents(row.components.filter((button) => {
        const data = button.toJSON();
        return !("custom_id" in data) || this.isAvailable(data.custom_id.split(":")[2]!);
      }))).filter((row) => row.components.length > 0),
    };
  }

  private buildXpScreen(guild: Guild, config: GuildConfig, sessionId: string): SetupView {
    const methods = (config.xpMethods || "messages").split(",");
    return {
      embeds: [this.baseEmbed(guild).setTitle("XP Settings").setDescription(
        `**Status:** ${config.xpEnabled ? "On" : "Off"}\n**Methods:** ${methods.join(", ")}\n` +
        `**Rewards:** Messages ${config.xpMessageAmount} • Reactions ${config.xpReactionAmount} • Daily ${config.xpDailyAmount} XP\n` +
        `**Cooldown:** ${config.xpCooldownSeconds}s for messages/reactions; daily claims every 24 hours\n` +
        `**Sharing:** ${config.xpSharing}\n**Selected servers:** ${config.xpSharedGuildIds.split(",").filter(Boolean).map((id) => guild.client?.guilds.cache.get(id)?.name ?? id).join(", ") || "None"}\n\n` +
        "Choose Servers opens a dropdown of your servers, with no IDs to copy. Sharing requires both servers to enable XP and select each other. Apply XP to Servers copies these settings to servers you manage. Daily claims use `/xp daily`.")],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          this.button(sessionId, "xp-toggle", config.xpEnabled ? "Disable XP" : "Enable XP", config.xpEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
          this.button(sessionId, "xp-rewards", "Edit Rewards", ButtonStyle.Primary),
          this.button(sessionId, "xp-peers", "Choose Servers", ButtonStyle.Secondary),
          this.button(sessionId, "xp-apply", "Apply XP to Servers", ButtonStyle.Primary),
          this.button(sessionId, "main", "Back", ButtonStyle.Secondary),
        ),
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder().setCustomId(`setup:${sessionId}:xp-methods`).setPlaceholder("Ways to earn XP")
            .setMinValues(1).setMaxValues(3).addOptions(XP_METHOD_CHOICES.slice(0, 3).map((choice) => ({
              label: choice.name, value: choice.value, default: methods.includes(choice.value),
            }))),
        ),
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder().setCustomId(`setup:${sessionId}:xp-sharing`).setPlaceholder("XP sharing scope")
            .addOptions([
              { label: "This server", value: "server", default: config.xpSharing === "server" },
              { label: "Global (participating servers)", value: "global", default: config.xpSharing === "global" },
              { label: "Selected servers (mutual)", value: "selected", default: config.xpSharing === "selected" },
            ]),
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          this.button(sessionId, "xp-peers-id", "Enter Sharing Server IDs", ButtonStyle.Secondary),
          this.button(sessionId, "xp-apply-id", "Apply Using Server IDs", ButtonStyle.Secondary),
        ),
      ],
    };
  }

  private buildWelcomeScreen(
    guild: Guild,
    config: GuildConfig,
    sessionId: string,
  ): SetupView {
    const embed = this.baseEmbed(guild)
      .setTitle("Welcome Messages")
      .setDescription(this.featureSummary({
        enabled: config.welcomeEnabled,
        target: this.channelText(config.welcomeChannelId),
      }))
      .addFields(
        {
          name: "Message Preview",
          value: this.codeBlock(config.welcomeMessage || DEFAULT_WELCOME_MESSAGE),
        },
      );

    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          this.button(
            sessionId,
            "welcome-toggle",
            config.welcomeEnabled ? "Disable" : "Enable",
            config.welcomeEnabled ? ButtonStyle.Danger : ButtonStyle.Success,
          ),
          this.button(sessionId, "welcome-edit", "Edit Message", ButtonStyle.Primary),
          this.button(sessionId, "welcome-variables", "Variables", ButtonStyle.Secondary),
          this.button(sessionId, "welcome-test", "Test", ButtonStyle.Secondary),
          this.button(sessionId, "main", "Back", ButtonStyle.Secondary),
        ),
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
          this.channelSelect(sessionId, "welcome-channel", "Select welcome channel"),
        ),
      ],
    };
  }

  private buildGoodbyeScreen(
    guild: Guild,
    config: GuildConfig,
    sessionId: string,
  ): SetupView {
    const embed = this.baseEmbed(guild)
      .setTitle("Goodbye Messages")
      .setDescription(this.featureSummary({
        enabled: config.goodbyeEnabled,
        target: this.channelText(config.goodbyeChannelId),
      }))
      .addFields(
        {
          name: "Message Preview",
          value: this.codeBlock(config.goodbyeMessage || DEFAULT_GOODBYE_MESSAGE),
        },
      );

    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          this.button(
            sessionId,
            "goodbye-toggle",
            config.goodbyeEnabled ? "Disable" : "Enable",
            config.goodbyeEnabled ? ButtonStyle.Danger : ButtonStyle.Success,
          ),
          this.button(sessionId, "goodbye-edit", "Edit Message", ButtonStyle.Primary),
          this.button(sessionId, "goodbye-variables", "Variables", ButtonStyle.Secondary),
          this.button(sessionId, "goodbye-test", "Test", ButtonStyle.Secondary),
          this.button(sessionId, "main", "Back", ButtonStyle.Secondary),
        ),
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
          this.channelSelect(sessionId, "goodbye-channel", "Select goodbye channel"),
        ),
      ],
    };
  }

  private buildVariablesScreen(
    guild: Guild,
    sessionId: string,
    type: "welcome" | "goodbye",
  ): SetupView {
    const embed = this.baseEmbed(guild)
      .setTitle(type === "welcome" ? "Welcome Variables" : "Goodbye Variables")
      .setDescription("Use these placeholders inside the message template.")
      .addFields({
        name: "Available Variables",
        value: this.variableList(type === "welcome"),
      });

    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          this.button(sessionId, type, "Back", ButtonStyle.Secondary),
          this.button(sessionId, "main", "Settings Home", ButtonStyle.Secondary),
        ),
      ],
    };
  }

  private buildAutoRoleScreen(
    guild: Guild,
    config: GuildConfig,
    sessionId: string,
  ): SetupView {
    const selectedRole = config.autoRoleId
      ? guild.roles.cache.get(config.autoRoleId)
      : null;
    const roleWarning = selectedRole
      ? validateAssignableRole(guild, selectedRole)
      : null;

    const embed = this.baseEmbed(guild)
      .setTitle("Auto Role")
      .setDescription(this.featureSummary({
        enabled: config.autoRoleEnabled,
        target: selectedRole ? `${selectedRole}` : "Not configured",
      }))
      .addFields(
        {
          name: "Role Check",
          value: roleWarning ?? "Role assignment is ready once enabled.",
        },
      );

    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          this.button(
            sessionId,
            "autorole-toggle",
            config.autoRoleEnabled ? "Disable" : "Enable",
            config.autoRoleEnabled ? ButtonStyle.Danger : ButtonStyle.Success,
          ),
          this.button(sessionId, "main", "Back", ButtonStyle.Secondary),
        ),
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId(`setup:${sessionId}:autorole-role`)
            .setPlaceholder("Select auto role")
            .setMinValues(1)
            .setMaxValues(1),
        ),
      ],
    };
  }

  private buildLoggingScreen(
    guild: Guild,
    config: GuildConfig,
    sessionId: string,
  ): SetupView {
    const embed = this.baseEmbed(guild)
      .setTitle("Logging")
      .setDescription(this.featureSummary({
        enabled: config.loggingEnabled,
        target: this.channelText(config.loggingChannelId),
      }));

    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          this.button(
            sessionId,
            "logging-toggle",
            config.loggingEnabled ? "Disable" : "Enable",
            config.loggingEnabled ? ButtonStyle.Danger : ButtonStyle.Success,
          ),
          this.button(sessionId, "main", "Back", ButtonStyle.Secondary),
        ),
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
          this.channelSelect(sessionId, "logging-channel", "Select logging channel"),
        ),
      ],
    };
  }

  private buildModerationScreen(
    guild: Guild,
    config: GuildConfig,
    sessionId: string,
  ): SetupView {
    const embed = this.baseEmbed(guild)
      .setTitle("Global Moderation")
      .setDescription("Choose which moderation actions this server shares with other participating Centerify servers.")
      .addFields(
        { name: "Global Ban", value: this.enabledText(config.globalBanEnabled), inline: true },
        { name: "Global Warn", value: this.enabledText(config.globalWarnEnabled), inline: true },
        { name: "Global Note", value: this.enabledText(config.globalNoteEnabled), inline: true },
      );

    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          this.button(sessionId, "global-ban-toggle", config.globalBanEnabled ? "Ban: On" : "Ban: Off", config.globalBanEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
          this.button(sessionId, "global-warn-toggle", config.globalWarnEnabled ? "Warn: On" : "Warn: Off", config.globalWarnEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
          this.button(sessionId, "global-note-toggle", config.globalNoteEnabled ? "Note: On" : "Note: Off", config.globalNoteEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
          this.button(sessionId, "main", "Back", ButtonStyle.Secondary),
        ),
      ],
    };
  }

  private channelSelect(sessionId: string, action: string, placeholder: string) {
    return new ChannelSelectMenuBuilder()
      .setCustomId(`setup:${sessionId}:${action}`)
      .setPlaceholder(placeholder)
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(1)
      .setMaxValues(1);
  }

  private button(
    sessionId: string,
    action: string,
    label: string,
    style: ButtonStyle,
  ) {
    return new ButtonBuilder()
      .setCustomId(`setup:${sessionId}:${action}`)
      .setLabel(label)
      .setStyle(style);
  }

  private baseEmbed(guild: Guild) {
    return new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setAuthor({
        name: guild.name,
        iconURL: guild.iconURL({ size: 128 }) ?? undefined,
      })
      .setFooter({ text: "Centerify settings" })
      .setTimestamp();
  }

  private statusLine(enabled: boolean, configuredValue: string | null) {
    if (!enabled) {
      return "Off";
    }

    return configuredValue ? "On" : "On, needs target";
  }

  private enabledText(enabled: boolean) {
    return enabled ? "On" : "Off";
  }

  private channelText(channelId: string | null) {
    return channelId ? `<#${channelId}>` : "Not configured";
  }

  private codeBlock(value: string) {
    const normalized = value.replaceAll("```", "`\u200b``");
    const preview = normalized.length > 1000 ? `${normalized.slice(0, 997)}...` : normalized;
    return `\`\`\`\n${preview}\n\`\`\``;
  }

  private variableList(includeWelcomeOnly: boolean) {
    return formatGreetingVariableList({ includeWelcomeOnly });
  }

  private setupSummary(config: GuildConfig) {
    return [
      this.summaryRow("Welcome", config.welcomeEnabled, this.channelText(config.welcomeChannelId)),
      this.summaryRow("Goodbye", config.goodbyeEnabled, this.channelText(config.goodbyeChannelId)),
      this.summaryRow("Auto Role", config.autoRoleEnabled, this.roleText(config.autoRoleId)),
      this.summaryRow("Logging", config.loggingEnabled, this.channelText(config.loggingChannelId)),
      `**XP:** ${config.xpEnabled ? `${config.xpMethods} • ${config.xpSharing} sharing` : "Off"}`,
      `**Global Moderation:** Ban ${this.enabledText(config.globalBanEnabled)} · Warn ${this.enabledText(config.globalWarnEnabled)} · Note ${this.enabledText(config.globalNoteEnabled)}`,
    ].join("\n");
  }

  private summaryRow(label: string, enabled: boolean, target: string) {
    if (!enabled) {
      return `**${label}:** Off`;
    }

    return `**${label}:** ${target === "Not configured" ? "Needs target" : target}`;
  }

  private featureSummary({
    enabled,
    target,
  }: {
    enabled: boolean;
    target: string;
  }) {
    return [`**Status:** ${this.enabledText(enabled)}`, `**Target:** ${target}`].join("\n");
  }

  private roleText(roleId: string | null) {
    return roleId ? `<@&${roleId}>` : "Not configured";
  }
}
