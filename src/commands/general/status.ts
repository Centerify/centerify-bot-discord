import { Command } from "@sapphire/framework";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
  escapeMarkdown,
  time,
  type ButtonInteraction,
  type GuildMember,
  type User,
} from "discord.js";

export class StatusCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("status")
        .setDescription("View a member's server profile")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The member to inspect")
            .setRequired(false),
        ),
    );
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ) {
    const targetUser = interaction.options.getUser("user") ?? interaction.user;

    if (!(await this.canInspectTarget(interaction, targetUser))) {
      await interaction.reply({
        content: "You need Manage Server permission to inspect another member.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    const member = await this.fetchGuildMember(interaction, targetUser.id);

    const moreInfoId = `status:more:${interaction.id}`;
    const avatarUrl = targetUser.displayAvatarURL({
      size: 1024,
    });

    const card = this.buildStatusCard({
      user: targetUser,
      member,
      requestedBy: interaction.user,
      customId: moreInfoId,
      avatarUrl,
    });

    await interaction.reply({
      components: [card],
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
            "Only the person who requested this profile can open the details.",
          flags: MessageFlags.Ephemeral,
        });

        return;
      }

      await buttonInteraction.reply({
        components: [
          this.buildDetailsCard(buttonInteraction, targetUser, member),
        ],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      });
    });

    collector.on("end", async () => {
      const expiredCard = this.buildStatusCard({
        user: targetUser,
        member,
        requestedBy: interaction.user,
        customId: moreInfoId,
        avatarUrl,
        disabled: true,
      });

      await interaction
        .editReply({
          components: [expiredCard],
        })
        .catch(() => null);
    });
  }

  private buildStatusCard({
    user,
    member,
    requestedBy,
    customId,
    avatarUrl,
    disabled = false,
  }: {
    user: User;
    member: GuildMember | null;
    requestedBy: User;
    customId: string;
    avatarUrl: string;
    disabled?: boolean;
  }) {
    const displayColor =
      member?.displayColor && member.displayColor !== 0
        ? member.displayColor
        : Colors.Blurple;

    const highestRole =
      member?.roles.highest && member.roles.highest.name !== "@everyone"
        ? member.roles.highest
        : null;

    const accountCreated = this.formatDate(user.createdAt);

    const joinedServer = member?.joinedAt
      ? this.formatDate(member.joinedAt)
      : "Not available";
    const visibleRoles = this.getVisibleRoles(member);
    const accountAgeDays = this.getAgeInDays(user.createdAt);
    const serverAgeDays = member?.joinedAt
      ? this.getAgeInDays(member.joinedAt)
      : null;
    const accountType = user.bot ? "Bot account" : "Member account";
    const serverStanding = this.getServerStanding(member);

    const header = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            `## ${escapeMarkdown(user.displayName)}`,
            `${user} • ${accountType}`,
            "",
            `${this.getPresenceLine(member)} • ${serverStanding}`,
          ].join("\n"),
        ),
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder()
          .setURL(
            user.displayAvatarURL({
              size: 512,
            }),
          )
          .setDescription(`${user.displayName}'s avatar`),
      );

    const summary = new TextDisplayBuilder().setContent(
      [
        "### At a glance",
        "",
        `**Account age**`,
        `${accountAgeDays.toLocaleString()} days`,
        "",
        `**Server tenure**`,
        serverAgeDays === null
          ? "Not available"
          : `${serverAgeDays.toLocaleString()} days`,
        "",
        `**Visible roles**`,
        `${visibleRoles.length}`,
      ].join("\n"),
    );

    const identity = new TextDisplayBuilder().setContent(
      [
        "### Identity",
        "",
        `**Username**`,
        `\`${user.tag}\``,
        "",
        `**User ID**`,
        `\`${user.id}\``,
        "",
        member?.nickname
          ? `**Server nickname**\n${escapeMarkdown(member.nickname)}`
          : "**Server nickname**\nNone",
      ].join("\n"),
    );

    const timeline = new TextDisplayBuilder().setContent(
      [
        "### Timeline",
        "",
        `**Account created**`,
        accountCreated,
        "",
        `**Joined this server**`,
        joinedServer,
      ].join("\n"),
    );

    const server = new TextDisplayBuilder().setContent(
      [
        "### Server",
        "",
        `**Top role**`,
        highestRole ? `${highestRole}` : "No highlighted role",
        "",
        `**Server signals**`,
        serverStanding,
      ].join("\n"),
    );

    const footer = new TextDisplayBuilder().setContent(
      `-# Requested by ${escapeMarkdown(requestedBy.displayName)} • ${time(
        new Date(),
        TimestampStyles.RelativeTime,
      )}`,
    );

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(disabled ? "Profile details expired" : "View full profile")
        .setEmoji(disabled ? "⏱️" : "👤")
        .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setLabel("Open avatar")
        .setEmoji("🖼️")
        .setStyle(ButtonStyle.Link)
        .setURL(avatarUrl),
    );
    return (
      new ContainerBuilder()
        .setAccentColor(displayColor)

        // Header + avatar
        .addSectionComponents(header)

        // Strong visual separation
        .addSeparatorComponents(
          new SeparatorBuilder()
            .setDivider(true)
            .setSpacing(SeparatorSpacingSize.Large),
        )

        // Main profile information
        .addTextDisplayComponents(summary)

        .addSeparatorComponents(
          new SeparatorBuilder()
            .setDivider(false)
            .setSpacing(SeparatorSpacingSize.Large),
        )

        .addTextDisplayComponents(identity)

        .addSeparatorComponents(
          new SeparatorBuilder()
            .setDivider(false)
            .setSpacing(SeparatorSpacingSize.Large),
        )

        .addTextDisplayComponents(timeline)

        .addSeparatorComponents(
          new SeparatorBuilder()
            .setDivider(false)
            .setSpacing(SeparatorSpacingSize.Large),
        )

        .addTextDisplayComponents(server)

        // Button area
        .addSeparatorComponents(
          new SeparatorBuilder()
            .setDivider(true)
            .setSpacing(SeparatorSpacingSize.Large),
        )

        .addActionRowComponents(actionRow)

        // Footer breathing room
        .addSeparatorComponents(
          new SeparatorBuilder()
            .setDivider(false)
            .setSpacing(SeparatorSpacingSize.Small),
        )

        .addTextDisplayComponents(footer)
    );
  }

  private buildDetailsCard(
    interaction: ButtonInteraction,
    user: User,
    member: GuildMember | null,
  ) {
    const displayColor =
      member?.displayColor && member.displayColor !== 0
        ? member.displayColor
        : Colors.Blurple;

    const roles = this.getVisibleRoles(member);

    const rolePreview = roles
      .slice(0, 12)
      .map((role) => `${role}`)
      .join(" ");

    const boostedSince = member?.premiumSince;

    const timedOutUntil = member?.communicationDisabledUntil;
    const serverStanding = this.getServerStanding(member);

    const header = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            `## ${escapeMarkdown(user.displayName)}`,
            "### Full profile",
            "",
            `${user} • ${serverStanding}`,
          ].join("\n"),
        ),
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder()
          .setURL(
            user.displayAvatarURL({
              size: 512,
            }),
          )
          .setDescription(`${user.displayName}'s avatar`),
      );

    const discordInfo = new TextDisplayBuilder().setContent(
      [
        "### Discord",
        "",
        `**Username**`,
        `\`${user.tag}\``,
        "",
        `**User ID**`,
        `\`${user.id}\``,
        "",
        `**Account type**`,
        user.bot ? "Bot" : "User",
        "",
        `**Status**`,
        this.getPresenceLine(member),
        "",
        `**Created**`,
        this.formatDate(user.createdAt),
      ].join("\n"),
    );

    const serverInfo = new TextDisplayBuilder().setContent(
      member
        ? [
          "### Server details",
          "",
          `**Nickname**`,
          member.nickname ? escapeMarkdown(member.nickname) : "None",
          "",
          `**Joined server**`,
          member.joinedAt ? this.formatDate(member.joinedAt) : "Unknown",
          "",
          `**Total roles**`,
          `${roles.length}`,
          "",
          `**Standing**`,
          serverStanding,
          "",
          `**Boosting**`,
          boostedSince
            ? `Since ${time(boostedSince, TimestampStyles.LongDate)}`
            : "Not boosting",
        ].join("\n")
        : [
          "### Server details",
          "",
          "Server member information is not available.",
        ].join("\n"),
    );

    const rolesInfo = new TextDisplayBuilder().setContent(
      [
        "### Roles",
        "",
        rolePreview || "No additional roles.",
        roles.length > 12 ? `\n-# +${roles.length - 12} more roles` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );

    const moderation = new TextDisplayBuilder().setContent(
      [
        "### Moderation",
        "",
        timedOutUntil
          ? [
            "**Timeout active**",
            `${time(timedOutUntil, TimestampStyles.RelativeTime)}`,
          ].join("\n")
          : "No active timeout.",
      ].join("\n"),
    );

    const footer = new TextDisplayBuilder().setContent(
      `-# Opened by ${escapeMarkdown(interaction.user.displayName)}`,
    );

    return new ContainerBuilder()
      .setAccentColor(displayColor)

      .addSectionComponents(header)

      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Large),
      )

      .addTextDisplayComponents(discordInfo)

      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(false)
          .setSpacing(SeparatorSpacingSize.Large),
      )

      .addTextDisplayComponents(serverInfo)

      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Large),
      )

      .addTextDisplayComponents(rolesInfo)

      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(false)
          .setSpacing(SeparatorSpacingSize.Large),
      )

      .addTextDisplayComponents(moderation)

      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(false)
          .setSpacing(SeparatorSpacingSize.Small),
      )

      .addTextDisplayComponents(footer);
  }

  private async fetchGuildMember(
    interaction: Command.ChatInputCommandInteraction,
    userId: string,
  ): Promise<GuildMember | null> {
    if (!interaction.inGuild()) {
      return null;
    }

    const cachedMember = interaction.guild?.members.cache.get(userId);

    if (cachedMember) {
      return cachedMember;
    }

    return interaction.guild?.members.fetch(userId).catch(() => null) ?? null;
  }

  private getVisibleRoles(member: GuildMember | null) {
    if (!member) {
      return [];
    }

    return [...member.roles.cache.values()]
      .filter((role) => role.id !== member.guild.id)
      .sort((a, b) => b.position - a.position);
  }

  private getPresenceLine(member: GuildMember | null) {
    const status = member?.presence?.status;

    switch (status) {
      case "online":
        return "🟢 Online";

      case "idle":
        return "🌙 Idle";

      case "dnd":
        return "⛔ Do not disturb";

      case "offline":
      case "invisible":
        return "⚫ Offline";

      default:
        return "Presence unavailable";
    }
  }

  private formatDate(date: Date) {
    return [
      time(date, TimestampStyles.RelativeTime),
      `-# ${time(date, TimestampStyles.LongDate)}`,
    ].join("\n");
  }

  private getAgeInDays(date: Date) {
    const millisecondsPerDay = 86_400_000;

    return Math.max(
      0,
      Math.floor((Date.now() - date.getTime()) / millisecondsPerDay),
    );
  }

  private getServerStanding(member: GuildMember | null) {
    if (!member) {
      return "Not in server cache";
    }

    if (member.communicationDisabledUntilTimestamp) {
      return "Timeout active";
    }

    if (member.guild.ownerId === member.id) {
      return "Server owner";
    }

    if (member.premiumSince) {
      return "Server booster";
    }

    return "Clear standing";
  }

  private async canInspectTarget(
    interaction: Command.ChatInputCommandInteraction,
    targetUser: User,
  ) {
    if (targetUser.id === interaction.user.id) {
      return true;
    }

    if (!interaction.inGuild()) {
      return false;
    }

    const requester = await this.fetchGuildMember(
      interaction,
      interaction.user.id,
    );

    return requester?.permissions.has(PermissionFlagsBits.ManageGuild) ?? false;
  }
}
