import { Command } from "@sapphire/framework";
import {
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
import { SetupInteractionHandler } from "../../services/setup/interactionHandler.js";
import { SetupRenderer } from "../../services/setup/renderer.js";

const SESSION_TTL = 10 * 60_000;

export class SetupCommand extends Command {
  private readonly renderer = new SetupRenderer();
  private readonly interactionHandler = new SetupInteractionHandler(
    this.renderer,
    this.updateConfig.bind(this),
  );

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("setup")
        .setDescription("Configure Centerify for this server")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setContexts(InteractionContextType.Guild),
    );
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: "Setup can only be used inside a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!canManageServer(interaction.member)) {
      await interaction.reply({
        content: "You need Manage Server or Administrator permission to run setup.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const sessionId = interaction.id;
    let config: GuildConfig;

    try {
      config = await this.loadConfig(interaction.guildId);
    } catch {
      await interaction.reply({
        content: "I could not load this server's setup right now. Please try again shortly.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const initialScreen = this.renderer.buildScreen(
      "main",
      interaction.guild,
      config,
      sessionId,
    );

    await interaction.reply({
      embeds: initialScreen.embeds,
      components: initialScreen.components,
      flags: MessageFlags.Ephemeral,
    });

    const reply = await interaction.fetchReply();
    const collector = reply.createMessageComponentCollector({
      time: SESSION_TTL,
    });

    collector.on("collect", async (componentInteraction) => {
      if (!componentInteraction.customId.startsWith(`setup:${sessionId}:`)) {
        return;
      }

      if (componentInteraction.user.id !== interaction.user.id) {
        await componentInteraction.reply({
          content: "Only the administrator who started this setup session can use these controls.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (
        !componentInteraction.isButton() &&
        !componentInteraction.isChannelSelectMenu() &&
        !componentInteraction.isRoleSelectMenu()
      ) {
        return;
      }

      try {
        config = await this.interactionHandler.handleComponent({
          componentInteraction,
          rootInteraction: interaction,
          config,
          sessionId,
        });
      } catch (error) {
        logger.error(
          {
            err: error,
            guildId: interaction.guildId,
            userId: interaction.user.id,
          },
          "Setup interaction failed",
        );

        await this.interactionHandler.respondWithError(componentInteraction).catch((responseError) => {
          logger.warn(
            {
              err: responseError,
              guildId: interaction.guildId,
              userId: interaction.user.id,
            },
            "Failed to send setup error response",
          );
        });
      }
    });

    collector.on("end", async () => {
      if (config.setupCompleted) {
        return;
      }

      await interaction
        .editReply(this.renderer.buildExpiredScreen(interaction.guild, config))
        .catch((error) => {
          logger.warn(
            { err: error, guildId: interaction.guildId },
            "Failed to expire setup session",
          );
        });
    });
  }

  private async loadConfig(guildId: string) {
    try {
      return await guildConfigService.getOrCreate(guildId);
    } catch (error) {
      logger.error({ err: error, guildId }, "Failed to load guild config");
      throw error;
    }
  }

  private async updateConfig(
    guildId: string,
    data: Parameters<typeof guildConfigService.update>[1],
  ) {
    try {
      return await guildConfigService.update(guildId, data);
    } catch (error) {
      logger.error({ err: error, guildId }, "Failed to update guild config");
      throw error;
    }
  }
}
