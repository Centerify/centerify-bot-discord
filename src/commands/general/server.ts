import { Command } from "@sapphire/framework";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Colors,
  ComponentType,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
  TimestampStyles,
  GuildVerificationLevel,
  escapeMarkdown,
  time,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
} from "discord.js";

type DynamicServerStats = {
  bans: number | null;
  vanityUrlCode: string | null;
  vanityUses: number | null;
};

export class ServerCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("server")
        .setDescription("Show information about this server"),
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

    const guild = interaction.guild;
    const owner = await guild.fetchOwner().catch(() => null);
    const moreInfoId = `server:more:${interaction.id}`;
    const iconUrl = guild.iconURL({ size: 1024 });

    await interaction.reply({
      components: [
        this.buildServerCard({
          guild,
          owner,
          requestedBy: interaction.user.displayName,
          customId: moreInfoId,
          iconUrl,
        }),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    const reply = await interaction.fetchReply();

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
    });

    collector.on("collect", async (buttonInteraction) => {
      if (buttonInteraction.customId !== moreInfoId) {
        return;
      }

      if (buttonInteraction.user.id !== interaction.user.id) {
        await buttonInteraction.reply({
          content:
            "Only the person who requested this server card can open the details.",
          flags: MessageFlags.Ephemeral,
        });

        return;
      }

      await buttonInteraction.deferReply({
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      });

      const canViewSensitiveStats = buttonInteraction.memberPermissions?.has(
        PermissionFlagsBits.ManageGuild,
      ) ?? false;
      const dynamicStats = await this.fetchDynamicStats(
        guild,
        canViewSensitiveStats,
      );

      await buttonInteraction.editReply({
        components: [
          this.buildDetailsCard(buttonInteraction, guild, owner, dynamicStats),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    });

    collector.on("end", async () => {
      await interaction
        .editReply({
          components: [
            this.buildServerCard({
              guild,
              owner,
              requestedBy: interaction.user.displayName,
              customId: moreInfoId,
              iconUrl,
              disabled: true,
            }),
          ],
        })
        .catch(() => null);
    });
  }

  private buildServerCard({
    guild,
    owner,
    requestedBy,
    customId,
    iconUrl,
    disabled = false,
  }: {
    guild: Guild;
    owner: GuildMember | null;
    requestedBy: string;
    customId: string;
    iconUrl: string | null;
    disabled?: boolean;
  }) {
    const channels = this.getChannelCounts(guild);
    const features = this.formatFeatures(guild.features, 5);

    const headerText = new TextDisplayBuilder().setContent(
      [
        `## ${escapeMarkdown(guild.name)}`,
        `${guild.memberCount.toLocaleString()} members • ${guild.roles.cache.size.toLocaleString()} roles`,
        "",
        `Created ${time(guild.createdAt, TimestampStyles.RelativeTime)}`,
      ].join("\n"),
    );

    const header = iconUrl
      ? new SectionBuilder()
        .addTextDisplayComponents(headerText)
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(iconUrl)
            .setDescription(`${guild.name} server icon`),
        )
      : null;

    const ownership = new TextDisplayBuilder().setContent(
      [
        "### Ownership",
        "",
        `**Owner**`,
        owner ? `${owner.user} (${escapeMarkdown(owner.user.tag)})` : "Unknown",
        "",
        `**Server ID**`,
        `\`${guild.id}\``,
      ].join("\n"),
    );

    const boosts = new TextDisplayBuilder().setContent(
      [
        "### Boosts",
        "",
        `**Boost level**`,
        this.formatBoostTier(guild.premiumTier),
        "",
        `**Boost count**`,
        `${(guild.premiumSubscriptionCount ?? 0).toLocaleString()}`,
        "",
        `**Boosters in cache**`,
        `${guild.members.cache.filter((member) => Boolean(member.premiumSince)).size.toLocaleString()}`,
      ].join("\n"),
    );

    const community = new TextDisplayBuilder().setContent(
      [
        "### Community",
        "",
        `**Channels**`,
        `${channels.total.toLocaleString()} total • ${channels.text.toLocaleString()} text • ${channels.voice.toLocaleString()} voice`,
        "",
        `**Emojis / stickers**`,
        `${guild.emojis.cache.size.toLocaleString()} emojis • ${guild.stickers.cache.size.toLocaleString()} stickers`,
        "",
        `**Features**`,
        features,
      ].join("\n"),
    );

    const footer = new TextDisplayBuilder().setContent(
      `-# Requested by ${escapeMarkdown(requestedBy)} • ${time(
        new Date(),
        TimestampStyles.RelativeTime,
      )}`,
    );

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(disabled ? "Server details expired" : "View more details")
        .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(disabled),
    );

    if (iconUrl) {
      actionRow.addComponents(
        new ButtonBuilder()
          .setLabel("Open icon")
          .setStyle(ButtonStyle.Link)
          .setURL(iconUrl),
      );
    }

    const container = new ContainerBuilder().setAccentColor(Colors.Blurple);

    if (header) {
      container.addSectionComponents(header);
    } else {
      container.addTextDisplayComponents(headerText);
    }

    return container
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Large),
      )
      .addTextDisplayComponents(ownership)
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(false)
          .setSpacing(SeparatorSpacingSize.Large),
      )
      .addTextDisplayComponents(boosts)
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(false)
          .setSpacing(SeparatorSpacingSize.Large),
      )
      .addTextDisplayComponents(community)
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Large),
      )
      .addActionRowComponents(actionRow)
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(false)
          .setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(footer);
  }

  private buildDetailsCard(
    interaction: ButtonInteraction,
    guild: Guild,
    owner: GuildMember | null,
    stats: DynamicServerStats,
  ) {
    const channels = this.getChannelCounts(guild);
    const moderationLine = [
      `Verification: ${this.formatVerificationLevel(guild.verificationLevel)}`,
      `MFA: ${guild.mfaLevel === 1 ? "Required" : "Not required"}`,
      `NSFW: ${guild.nsfwLevel}`,
    ].join("\n");

    const overview = new TextDisplayBuilder().setContent(
      [
        "### Overview",
        "",
        `**Name**`,
        escapeMarkdown(guild.name),
        "",
        `**Description**`,
        guild.description ? escapeMarkdown(guild.description) : "None",
        "",
        `**Owner**`,
        owner ? `${owner.user} (${escapeMarkdown(owner.user.tag)})` : "Unknown",
        "",
        `**Created**`,
        this.formatDate(guild.createdAt),
      ].join("\n"),
    );

    const counts = new TextDisplayBuilder().setContent(
      [
        "### Counts",
        "",
        `**Members**`,
        `${guild.memberCount.toLocaleString()}`,
        "",
        `**Channels**`,
        `${channels.total.toLocaleString()} total`,
        `-# ${channels.text.toLocaleString()} text • ${channels.voice.toLocaleString()} voice • ${channels.category.toLocaleString()} categories`,
        "",
        `**Roles**`,
        `${guild.roles.cache.size.toLocaleString()}`,
        "",
        `**Bans**`,
        stats.bans === null ? "Unavailable" : stats.bans.toLocaleString(),
      ].join("\n"),
    );

    const serverSettings = new TextDisplayBuilder().setContent(
      [
        "### Settings",
        "",
        `**Preferred locale**`,
        guild.preferredLocale,
        "",
        `**Moderation**`,
        moderationLine,
        "",
        `**Vanity URL**`,
        stats.vanityUrlCode
          ? `discord.gg/${escapeMarkdown(stats.vanityUrlCode)} • ${(stats.vanityUses ?? 0).toLocaleString()} uses`
          : "None or unavailable",
      ].join("\n"),
    );

    const extras = new TextDisplayBuilder().setContent(
      [
        "### Extras",
        "",
        `**Boosts**`,
        `${this.formatBoostTier(guild.premiumTier)} • ${(guild.premiumSubscriptionCount ?? 0).toLocaleString()} boosts`,
        "",
        `**Features**`,
        this.formatFeatures(guild.features, 12),
        "",
        `**Assets**`,
        `${guild.emojis.cache.size.toLocaleString()} emojis • ${guild.stickers.cache.size.toLocaleString()} stickers`,
      ].join("\n"),
    );

    const footer = new TextDisplayBuilder().setContent(
      `-# Opened by ${escapeMarkdown(interaction.user.displayName)}`,
    );

    return new ContainerBuilder()
      .setAccentColor(Colors.Blurple)
      .addTextDisplayComponents(overview)
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Large),
      )
      .addTextDisplayComponents(counts)
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(false)
          .setSpacing(SeparatorSpacingSize.Large),
      )
      .addTextDisplayComponents(serverSettings)
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(false)
          .setSpacing(SeparatorSpacingSize.Large),
      )
      .addTextDisplayComponents(extras)
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(false)
          .setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(footer);
  }

  private async fetchDynamicStats(
    guild: Guild,
    includeSensitiveStats: boolean,
  ): Promise<DynamicServerStats> {
    const [bans, vanity] = await Promise.all([
      includeSensitiveStats ? guild.bans.fetch().catch(() => null) : null,
      guild.fetchVanityData().catch(() => null),
    ]);

    return {
      bans: bans?.size ?? null,
      vanityUrlCode: vanity?.code ?? null,
      vanityUses: vanity?.uses ?? null,
    };
  }

  private getChannelCounts(guild: Guild) {
    const values = [...guild.channels.cache.values()];

    return {
      total: values.length,
      text: values.filter((channel) => channel.type === ChannelType.GuildText)
        .length,
      voice: values.filter((channel) => channel.type === ChannelType.GuildVoice)
        .length,
      category: values.filter(
        (channel) => channel.type === ChannelType.GuildCategory,
      ).length,
    };
  }

  private formatBoostTier(tier: Guild["premiumTier"]) {
    return tier === 0 ? "No level" : `Level ${tier}`;
  }

  private formatFeatures(features: readonly string[], limit: number) {
    if (features.length === 0) {
      return "None";
    }

    const formatted = features
      .slice(0, limit)
      .map((feature) => `\`${escapeMarkdown(feature)}\``)
      .join(" ");

    return features.length > limit
      ? `${formatted}\n-# +${features.length - limit} more`
      : formatted;
  }

  private formatVerificationLevel(level: GuildVerificationLevel) {
    switch (level) {
      case GuildVerificationLevel.None:
        return "None";
      case GuildVerificationLevel.Low:
        return "Low";
      case GuildVerificationLevel.Medium:
        return "Medium";
      case GuildVerificationLevel.High:
        return "High";
      case GuildVerificationLevel.VeryHigh:
        return "Very high";
    }
  }

  private formatDate(date: Date) {
    return [
      time(date, TimestampStyles.RelativeTime),
      `-# ${time(date, TimestampStyles.LongDate)}`,
    ].join("\n");
  }
}
