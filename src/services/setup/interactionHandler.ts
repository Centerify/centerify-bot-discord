import { Command } from "@sapphire/framework";
import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChannelSelectMenuInteraction,
  type ModalSubmitInteraction,
  type RoleSelectMenuInteraction,
} from "discord.js";
import { handleXpModal } from "./xpInteractionHandler.js";
import { handleXpServerPicker } from "./xpServerPicker.js";
import { requireVerifiedOwnership } from "../guildOwnershipService.js";
import { greetingService } from "../greetingService.js";
import type { GuildConfig, GuildConfigUpdate } from "../guildConfigService.js";
import {
  canManageServer,
  canSendToChannel,
  isUsableTextChannel,
  validateAssignableRole,
} from "./guards.js";
import type { SetupRenderer } from "./renderer.js";
import type { SetupComponentInteraction } from "./types.js";

type UpdateConfig = (
  guildId: string,
  data: GuildConfigUpdate,
) => Promise<GuildConfig>;

export class SetupInteractionHandler {
  public constructor(
    private readonly renderer: SetupRenderer,
    private readonly updateConfig: UpdateConfig,
  ) {}

  public async handleComponent({
    componentInteraction,
    rootInteraction,
    config,
    sessionId,
  }: {
    componentInteraction: SetupComponentInteraction;
    rootInteraction: Command.ChatInputCommandInteraction<"cached">;
    config: GuildConfig;
    sessionId: string;
  }) {
    if (componentInteraction.user.id !== rootInteraction.user.id || !canManageServer(componentInteraction.member)) {
      await componentInteraction.reply({ content: "Only the administrator who opened settings can use these controls, and Manage Server permission is required.", flags: MessageFlags.Ephemeral });
      return config;
    }
    const action = componentInteraction.customId.split(":").at(2);
    const opensModal = componentInteraction.isButton() && ["welcome-edit", "goodbye-edit", "xp-rewards", "xp-peers-id", "xp-apply-id"].includes(action ?? "");
    if (!opensModal) {
      // Acknowledge before the ownership check's network and database requests.
      if (componentInteraction.isButton() && (action === "xp-peers" || action === "xp-apply")) {
        await componentInteraction.deferReply({ flags: MessageFlags.Ephemeral });
      } else {
        await componentInteraction.deferUpdate();
      }
      if (!await requireVerifiedOwnership(componentInteraction)) return config;
    }
    // Modal submissions recheck ownership before saving; showing a modal must
    // itself be the initial response to its button interaction.

    if (componentInteraction.isStringSelectMenu()) {
      let data: GuildConfigUpdate;
      if (action === "xp-methods" && componentInteraction.values.length > 0 && componentInteraction.values.every((value) => ["messages", "reactions", "daily"].includes(value))) {
        data = { xpMethods: ["messages", "reactions", "daily"].filter((method) => componentInteraction.values.includes(method)).join(",") };
      } else if (action === "xp-sharing" && componentInteraction.values.length === 1 && ["server", "global", "selected"].includes(componentInteraction.values[0])) {
        data = { xpSharing: componentInteraction.values[0] };
      } else {
        await componentInteraction.followUp({ content: "Choose valid XP options.", flags: MessageFlags.Ephemeral });
        return config;
      }
      if (!componentInteraction.deferred) await componentInteraction.deferUpdate();
      const next = await this.updateConfig(componentInteraction.guildId, data);
      await rootInteraction.editReply(this.renderer.buildScreen("xp", componentInteraction.guild, next, sessionId));
      return next;
    }
    if (componentInteraction.isButton()) {
      return this.handleButton({
        interaction: componentInteraction,
        rootInteraction,
        config,
        sessionId,
        action,
      });
    }

    if (componentInteraction.isChannelSelectMenu()) {
      return this.handleChannelSelect({
        interaction: componentInteraction,
        config,
        sessionId,
        action,
      });
    }

    if (componentInteraction.isRoleSelectMenu()) {
      return this.handleRoleSelect({
        interaction: componentInteraction,
        config,
        sessionId,
        action,
      });
    }

    return config;
  }

  public async respondWithError(interaction: SetupComponentInteraction) {
    const content = "Something went wrong while saving settings. Please try again.";

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
  }

  private async handleButton({
    interaction,
    rootInteraction,
    config,
    sessionId,
    action,
  }: {
    interaction: ButtonInteraction<"cached">;
    rootInteraction: Command.ChatInputCommandInteraction<"cached">;
    config: GuildConfig;
    sessionId: string;
    action: string | undefined;
  }) {
    switch (action) {
      case "xp":
      case "main":
      case "welcome":
      case "welcome-variables":
      case "goodbye":
      case "goodbye-variables":
      case "autorole":
      case "logging":
      case "moderation":
        await interaction.editReply(
          this.renderer.buildScreen(action, interaction.guild, config, sessionId),
        );
        return config;

      case "xp-toggle": {
        if (!interaction.deferred) await interaction.deferUpdate();
        const next = await this.updateConfig(interaction.guildId, { xpEnabled: !config.xpEnabled });
        await rootInteraction.editReply(this.renderer.buildScreen("xp", interaction.guild, next, sessionId));
        return next;
      }
      case "xp-rewards":
        return handleXpModal(interaction, rootInteraction, config, sessionId, action, this.renderer, this.updateConfig);
      case "xp-peers":
      case "xp-apply":
        return handleXpServerPicker(interaction, rootInteraction, config, sessionId, action === "xp-apply", this.renderer, this.updateConfig);
      case "xp-peers-id":
      case "xp-apply-id":
        return handleXpModal(interaction, rootInteraction, config, sessionId, action === "xp-peers-id" ? "xp-peers" : "xp-apply", this.renderer, this.updateConfig);

      case "welcome-toggle": {
        if (!interaction.deferred) await interaction.deferUpdate();
        const next = await this.updateConfig(interaction.guildId, {
          welcomeEnabled: !config.welcomeEnabled,
        });
        await rootInteraction.editReply(
          this.renderer.buildScreen("welcome", interaction.guild, next, sessionId),
        );
        return next;
      }

      case "goodbye-toggle": {
        if (!interaction.deferred) await interaction.deferUpdate();
        const next = await this.updateConfig(interaction.guildId, {
          goodbyeEnabled: !config.goodbyeEnabled,
        });
        await rootInteraction.editReply(
          this.renderer.buildScreen("goodbye", interaction.guild, next, sessionId),
        );
        return next;
      }

      case "autorole-toggle": {
        if (!interaction.deferred) await interaction.deferUpdate();
        const next = await this.updateConfig(interaction.guildId, {
          autoRoleEnabled: !config.autoRoleEnabled,
        });
        await rootInteraction.editReply(
          this.renderer.buildScreen("autorole", interaction.guild, next, sessionId),
        );
        return next;
      }

      case "logging-toggle": {
        if (!interaction.deferred) await interaction.deferUpdate();
        const next = await this.updateConfig(interaction.guildId, {
          loggingEnabled: !config.loggingEnabled,
        });
        await rootInteraction.editReply(
          this.renderer.buildScreen("logging", interaction.guild, next, sessionId),
        );
        return next;
      }

      case "global-ban-toggle":
      case "global-warn-toggle":
      case "global-note-toggle": {
        if (!interaction.deferred) await interaction.deferUpdate();
        const update = action === "global-ban-toggle"
          ? { globalBanEnabled: !config.globalBanEnabled }
          : action === "global-warn-toggle"
            ? { globalWarnEnabled: !config.globalWarnEnabled }
            : { globalNoteEnabled: !config.globalNoteEnabled };
        const next = await this.updateConfig(interaction.guildId, update);
        await rootInteraction.editReply(
          this.renderer.buildScreen("moderation", interaction.guild, next, sessionId),
        );
        return next;
      }

      case "welcome-edit":
      case "goodbye-edit":
        return this.handleMessageModal({
          interaction,
          rootInteraction,
          config,
          sessionId,
          type: action === "welcome-edit" ? "welcome" : "goodbye",
        });

      case "welcome-test":
        if (!interaction.deferred) await interaction.deferUpdate();
        await interaction.followUp({
          content: greetingService.renderWelcome(config, interaction.member),
          flags: MessageFlags.Ephemeral,
        });
        return config;

      case "goodbye-test":
        if (!interaction.deferred) await interaction.deferUpdate();
        await interaction.followUp({
          content: greetingService.renderGoodbye(config, interaction.member),
          flags: MessageFlags.Ephemeral,
        });
        return config;

      case "finish": {
        if (!interaction.deferred) await interaction.deferUpdate();
        const next = await this.updateConfig(interaction.guildId, {
          setupCompleted: true,
        });
        await rootInteraction.editReply(this.renderer.buildFinishScreen(interaction.guild, next));
        return next;
      }

      default:
        await interaction.followUp({
          content: "That settings control is no longer available.",
          flags: MessageFlags.Ephemeral,
        });
        return config;
    }
  }

  private async handleChannelSelect({
    interaction,
    config,
    sessionId,
    action,
  }: {
    interaction: ChannelSelectMenuInteraction<"cached">;
    config: GuildConfig;
    sessionId: string;
    action: string | undefined;
  }) {
    const channel = interaction.channels.first();
    if (!channel || !isUsableTextChannel(channel)) {
      await interaction.followUp({
        content: "Please choose a text channel I can send messages in.",
        flags: MessageFlags.Ephemeral,
      });
      return config;
    }

    if (!canSendToChannel(interaction.guild, channel)) {
      await interaction.followUp({
        content: "I cannot send messages in that channel. Please check my channel permissions.",
        flags: MessageFlags.Ephemeral,
      });
      return config;
    }

    const update =
      action === "welcome-channel"
        ? { welcomeChannelId: channel.id }
        : action === "goodbye-channel"
          ? { goodbyeChannelId: channel.id }
          : action === "logging-channel"
            ? { loggingChannelId: channel.id }
            : null;

    if (!update) {
      await interaction.followUp({
        content: "That channel selector is no longer available.",
        flags: MessageFlags.Ephemeral,
      });
      return config;
    }

    if (!interaction.deferred) await interaction.deferUpdate();
    const next = await this.updateConfig(interaction.guildId, update);
    const screen =
      action === "welcome-channel"
        ? "welcome"
        : action === "goodbye-channel"
          ? "goodbye"
          : "logging";

    await interaction.editReply(
      this.renderer.buildScreen(screen, interaction.guild, next, sessionId),
    );

    return next;
  }

  private async handleRoleSelect({
    interaction,
    config,
    sessionId,
    action,
  }: {
    interaction: RoleSelectMenuInteraction<"cached">;
    config: GuildConfig;
    sessionId: string;
    action: string | undefined;
  }) {
    if (action !== "autorole-role") {
      await interaction.followUp({
        content: "That role selector is no longer available.",
        flags: MessageFlags.Ephemeral,
      });
      return config;
    }

    const role = interaction.roles.first();
    if (!role) {
      await interaction.followUp({
        content: "Please choose a role.",
        flags: MessageFlags.Ephemeral,
      });
      return config;
    }

    const validation = validateAssignableRole(interaction.guild, role);
    if (validation) {
      await interaction.followUp({
        content: validation,
        flags: MessageFlags.Ephemeral,
      });
      return config;
    }

    if (!interaction.deferred) await interaction.deferUpdate();
    const next = await this.updateConfig(interaction.guildId, {
      autoRoleId: role.id,
    });

    await interaction.editReply(
      this.renderer.buildScreen("autorole", interaction.guild, next, sessionId),
    );

    return next;
  }

  private async handleMessageModal({
    interaction,
    rootInteraction,
    config,
    sessionId,
    type,
  }: {
    interaction: ButtonInteraction<"cached">;
    rootInteraction: Command.ChatInputCommandInteraction<"cached">;
    config: GuildConfig;
    sessionId: string;
    type: "welcome" | "goodbye";
  }) {
    const modalId = `setup:${sessionId}:${type}-modal`;
    const fieldId = `${type}-message`;

    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle(type === "welcome" ? "Welcome Message" : "Goodbye Message")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(fieldId)
            .setLabel(type === "welcome" ? "Welcome message" : "Goodbye message")
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(1)
            .setMaxLength(1_500)
            .setValue(
              type === "welcome"
                ? config.welcomeMessage
                : config.goodbyeMessage,
            )
            .setRequired(true),
        ),
      );

    await interaction.showModal(modal);

    const modalSubmit = await interaction
      .awaitModalSubmit({
        filter: (submit) =>
          submit.customId === modalId && submit.user.id === interaction.user.id,
        time: 120_000,
      })
      .catch(() => null);

    if (!modalSubmit) {
      return config;
    }

    return this.updateMessageFromModal({
      modalSubmit,
      rootInteraction,
      sessionId,
      fieldId,
      type,
    });
  }

  private async updateMessageFromModal({
    modalSubmit,
    rootInteraction,
    sessionId,
    fieldId,
    type,
  }: {
    modalSubmit: ModalSubmitInteraction<"cached">;
    rootInteraction: Command.ChatInputCommandInteraction<"cached">;
    sessionId: string;
    fieldId: string;
    type: "welcome" | "goodbye";
  }) {
    await modalSubmit.deferReply({ flags: MessageFlags.Ephemeral });
    if (!await requireVerifiedOwnership(modalSubmit)) {
      throw new Error("Server ownership is no longer verified");
    }
    if (!canManageServer(modalSubmit.member)) {
      await modalSubmit.editReply({ content: "You need Manage Server permission to save settings." });
      throw new Error("Manage Server permission was revoked");
    }
    const message = modalSubmit.fields.getTextInputValue(fieldId).trim();
    if (!message) {
      await modalSubmit.editReply({ content: "The message template cannot be empty." });
      throw new Error("Empty message template");
    }

    const next = await this.updateConfig(modalSubmit.guildId, {
      [type === "welcome" ? "welcomeMessage" : "goodbyeMessage"]: message,
    });

    await rootInteraction.editReply(
      this.renderer.buildScreen(type, modalSubmit.guild, next, sessionId),
    );
    await modalSubmit.editReply({ content: "Message settings saved." });

    return next;
  }
}
