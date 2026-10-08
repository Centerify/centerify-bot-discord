import { trackCollector } from "../../../../adapters/discord/resources.js";
import { settingsActionAvailable } from "../availability.js";
import { Command } from "@sapphire/framework";
import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../../../../adapters/logging/runtime.js";
import {
  guildConfigService,
  type GuildConfig,
} from "../../../guilds/discord/index.js";
import { canManageServer } from "../../../guilds/discord/index.js";
import { SetupInteractionHandler } from "../interactionHandler.js";
import { SetupRenderer } from "../renderer.js";

const SESSION_TTL = 10 * 60_000;

export class SetupCommand extends Command {
  private readonly renderer = new SetupRenderer("setup", settingsActionAvailable);
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
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }
    if (!interaction.inCachedGuild()) {
      await interaction.editReply({
        content: "Setup can only be used inside a server.",
      });
      return;
    }

    if (!canManageServer(interaction.member)) {
      await interaction.editReply({
        content:
          "You need Manage Server or Administrator permission to run setup.",
      });
      return;
    }

    const sessionId = interaction.id;
    let config: GuildConfig;

    try {
      config = await this.loadConfig(interaction.guildId);
    } catch {
      await interaction.editReply({
        content:
          "I could not load this server's setup right now. Please try again shortly.",
      });
      return;
    }

    const initialScreen = this.renderer.buildScreen(
      "main",
      interaction.guild,
      config,
      sessionId,
    );

    await interaction.editReply({
      embeds: initialScreen.embeds,
      components: initialScreen.components,
    });

    const reply = await interaction.fetchReply();
    const collector = reply.createMessageComponentCollector({
      time: SESSION_TTL,
    });
  trackCollector("settings", collector);

    let finished = false;
    let busy = false;
    collector.on("collect", async (componentInteraction) => {
      if (!componentInteraction.customId.startsWith(`setup:${sessionId}:`)) {
        return;
      }

      if (componentInteraction.user.id !== interaction.user.id) {
        await componentInteraction.reply({
          content:
            "Only the administrator who started this setup session can use these controls.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (
        !componentInteraction.isButton() &&
        !componentInteraction.isChannelSelectMenu() &&
        !componentInteraction.isRoleSelectMenu() &&
        !componentInteraction.isStringSelectMenu()
      ) {
        return;
      }

      if (finished || busy) {
        await componentInteraction.reply({ content: finished ? "This setup session is complete. Run /setup again." : "Finish the current setup action before starting another.", flags: MessageFlags.Ephemeral });
        return;
      }
      collector.resetTimer();
      busy = true;
      try {
        config = await this.interactionHandler.handleComponent({
          componentInteraction,
          rootInteraction: interaction,
          config,
          sessionId,
        });
        if (componentInteraction.customId === `setup:${sessionId}:finish` && componentInteraction.deferred) {
          finished = true;
          collector.stop("finished");
        }
      } catch (error) {
        logger.error(
          {
            err: error,
            guildId: interaction.guildId,
            userId: interaction.user.id,
          },
          "Setup interaction failed",
        );

        await this.interactionHandler
          .respondWithError(componentInteraction)
          .catch((responseError) => {
            logger.warn(
              {
                err: responseError,
                guildId: interaction.guildId,
                userId: interaction.user.id,
              },
              "Failed to send setup error response",
            );
          });
      } finally {
        busy = false;
      }
    });

    collector.on("end", async () => {
      if (finished) {
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
