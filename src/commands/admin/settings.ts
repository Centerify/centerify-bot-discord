import { Command } from "@sapphire/framework";
import {
  Colors,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../../logger.js";
import {
  guildConfigService,
  type GuildConfig,
} from "../../services/guildConfigService.js";
import { canManageServer } from "../../services/setup/guards.js";

import { SetupRenderer } from "../../services/setup/renderer.js";
import { SetupInteractionHandler } from "../../services/setup/interactionHandler.js";

export class SettingsCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("settings")
        .setDescription("View or update this server's Centerify configuration")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setContexts(InteractionContextType.Guild),
    );
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    if (!interaction.inCachedGuild()) {
      await interaction.editReply({
        content: "This command can only be used inside a server.",
      });
      return;
    }

    if (!canManageServer(interaction.member)) {
      await interaction.editReply({
        content: "You need Manage Server permission to manage settings.",
      });
      return;
    }

    const config = await guildConfigService.getOrCreate(interaction.guildId).catch((error) => {
      logger.error({ err: error, guildId: interaction.guildId }, "Failed to load settings");
      return null;
    });

    if (!config) {
      await interaction.editReply({
        content: "I could not load this server's settings right now.",
      });
      return;
    }

    const message = await interaction.editReply(this.buildView(interaction, config, "Choose a section below to manage settings."));
    let current = config;
    let busy = false;
    let finished = false;
    const renderer = new SetupRenderer();
    const handler = new SetupInteractionHandler(renderer, (id, data) => guildConfigService.update(id, data));
    const collector = message.createMessageComponentCollector({ time: 10 * 60_000 });
    collector.on("collect", async (button) => {
      if (!button.customId.startsWith(`setup:${interaction.id}:`)) return;
      if (!button.isButton() && !button.isStringSelectMenu() && !button.isChannelSelectMenu() && !button.isRoleSelectMenu()) return;
      if (button.user.id !== interaction.user.id || !button.inCachedGuild() || !canManageServer(button.member)) {
        await button.reply({ content: "Only the administrator who opened settings can use these controls, and Manage Server permission is required.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (busy || finished) {
        await button.reply({ content: finished ? "This settings session is closed. Run /settings again." : "Finish the current settings action first.", flags: MessageFlags.Ephemeral });
        return;
      }
      const action = button.customId.split(":").at(2);
      busy = true;
      collector.resetTimer();
      try {
        current = await handler.handleComponent({ componentInteraction: button, rootInteraction: interaction, config: current, sessionId: interaction.id });
        if (action === "finish" && button.deferred) {
          finished = true;
          collector.stop("finished");
        }
      } catch (error) {
        logger.error({ err: error, guildId: interaction.guildId }, "Settings interaction failed");
        if (button.deferred || button.replied) {
          await button.followUp({ content: "I could not load or save settings right now. Please try again.", flags: MessageFlags.Ephemeral }).catch(() => null);
        } else {
          await button.reply({ content: "I could not open settings right now. Please try again.", flags: MessageFlags.Ephemeral }).catch(() => null);
        }
      } finally {
        busy = false;
      }
    });
    collector.on("end", () => {
      void interaction.editReply({ components: [] }).catch(() => null);
    });
  }

  private buildView(interaction: Command.ChatInputCommandInteraction<"cached">, config: GuildConfig, content: string) {
    return {
      content,
      components: new SetupRenderer().buildScreen("main", interaction.guild, config, interaction.id).components!,
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
              name: "XP",
              value: config.xpEnabled ? `On • ${config.xpSharing ?? "server"} sharing` : "Off",
              inline: true,
            },
            {
              name: "XP Earning",
              value: `Methods: ${config.xpMethods}\nMessages: ${config.xpMessageAmount} XP • Reactions: ${config.xpReactionAmount} XP\nDaily: ${config.xpDailyAmount} XP per 24 hours\nMessage/reaction cooldown: ${config.xpCooldownSeconds}s (independent)`,
            },
            {
              name: "Selected XP Servers",
              value: config.xpSharedGuildIds.split(",").filter(Boolean).map((id) => (interaction.client?.guilds.cache.get(id)?.name ?? id).replace(/[\\`*_~|<>@\r\n]/g, "").slice(0, 35)).join(", ") || "None",
            },
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
    };
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
