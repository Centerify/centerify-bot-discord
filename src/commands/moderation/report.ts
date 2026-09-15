import { Command } from "@sapphire/framework";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  ComponentType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  TimestampStyles,
  time,
  type ButtonInteraction,
} from "discord.js";
import { logger } from "../../logger.js";
import { guildConfigService } from "../../services/guildConfigService.js";
import { moderationCaseService } from "../../services/moderation/caseService.js";
import { reportService } from "../../services/moderation/reportService.js";
import { validateChannelSendAccess, hasModeratorPermission } from "../../services/moderation/permissionGuards.js";
import { isModerationLogChannel } from "../../services/moderation/commandUtils.js";

export class ReportCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("report")
        .setDescription("Report a user to the moderation team")
        .setContexts(InteractionContextType.Guild)
        .addUserOption((option) => option.setName("user").setDescription("User to report").setRequired(true))
        .addStringOption((option) => option.setName("reason").setDescription("Reason").setMaxLength(1_000).setRequired(true)),
    );
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: "This command can only be used inside a server.", flags: MessageFlags.Ephemeral });
      return;
    }
    const user = interaction.options.getUser("user", true);
    if (user.id === interaction.user.id || user.bot || user.system) {
      await interaction.reply({ content: "Please choose another server member to report.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const reason = interaction.options.getString("reason", true).trim();
    try {
      const config = await guildConfigService.getOrCreate(interaction.guildId);
      if (!config.loggingEnabled || !config.loggingChannelId) {
        await interaction.editReply({ content: "Reports need a configured logging channel. Ask an administrator to run `/logging channel`." });
        return;
      }
      const channel = await interaction.guild.channels.fetch(config.loggingChannelId).catch(() => null);
      if (
        !isModerationLogChannel(channel) ||
        validateChannelSendAccess(interaction.guild, channel)
      ) {
        await interaction.editReply({ content: "The configured logging channel is unavailable. Ask an administrator to update `/logging channel`." });
        return;
      }
      const report = await reportService.createReport({ guildId: interaction.guildId, reportedUserId: user.id, reporterUserId: interaction.user.id, reason });
      const message = await channel.send({
        embeds: [this.buildReportEmbed(report.reportNumber, user.id, interaction.user.id, reason)],
        components: [this.buildActions(interaction.guildId, report.reportNumber)],
      });

      const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 7 * 24 * 60 * 60_000 });
      collector.on("collect", async (buttonInteraction: ButtonInteraction) => {
        if (!buttonInteraction.inCachedGuild() || buttonInteraction.guildId !== interaction.guildId) {
          return;
        }
        if (!hasModeratorPermission(buttonInteraction.member, PermissionFlagsBits.ModerateMembers)) {
          await buttonInteraction.reply({ content: "Only moderators can review reports.", flags: MessageFlags.Ephemeral });
          return;
        }
        const action = buttonInteraction.customId.split(":").at(3);
        if (action === "history") {
          const history = await moderationCaseService.recentForUser(interaction.guildId, user.id, 5);
          await buttonInteraction.reply({
            content: history.length > 0 ? history.map((item) => `#${item.caseNumber} ${item.action}: ${item.reason}`).join("\n") : "No moderation history found.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        if (action === "view") {
          await buttonInteraction.reply({ content: `Reported user: <@${user.id}> (\`${user.id}\`)`, flags: MessageFlags.Ephemeral });
          return;
        }
        if (action === "accept" || action === "reject") {
          const next = await reportService.updateStatus({ guildId: interaction.guildId, reportNumber: report.reportNumber, status: action === "accept" ? "ACCEPTED" : "REJECTED", reviewedBy: buttonInteraction.user.id });
          await buttonInteraction.update({ embeds: [this.buildReportEmbed(report.reportNumber, user.id, interaction.user.id, reason, next?.status ?? "PENDING", buttonInteraction.user.id)], components: [] });
        }
      });

      await interaction.editReply({ content: `Report submitted - Report #${report.reportNumber}` });
    } catch (error) {
      logger.error({ err: error, guildId: interaction.guildId, userId: user.id }, "Report command failed");
      await interaction.editReply({ content: "I could not submit that report right now." });
    }
  }

  private buildReportEmbed(reportNumber: number, reportedUserId: string, reporterUserId: string, reason: string, status = "PENDING", reviewedBy?: string) {
    return new EmbedBuilder()
      .setColor(status === "PENDING" ? Colors.Orange : status === "ACCEPTED" ? Colors.Green : Colors.Red)
      .setTitle(`Report #${reportNumber} - ${status}`)
      .addFields(
        { name: "Reported User", value: `<@${reportedUserId}>`, inline: true },
        { name: "Reporter", value: `<@${reporterUserId}>`, inline: true },
        { name: "Created", value: time(new Date(), TimestampStyles.ShortDateTime), inline: true },
        { name: "Reason", value: reason },
        ...(reviewedBy ? [{ name: "Reviewed By", value: `<@${reviewedBy}>`, inline: true }] : []),
      )
      .setTimestamp();
  }

  private buildActions(guildId: string, reportNumber: number) {
    const base = `report:${guildId}:${reportNumber}`;
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${base}:accept`).setLabel("Accept").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`${base}:reject`).setLabel("Reject").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`${base}:view`).setLabel("View User").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${base}:history`).setLabel("View History").setStyle(ButtonStyle.Secondary),
    );
  }
}
