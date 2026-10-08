import { Command } from "@sapphire/framework";
import { Colors, EmbedBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits } from "discord.js";
import { logger } from "../../../../adapters/logging/runtime.js";
import { moderationCaseService } from "../services.js";
import { buildCaseEmbed, formatCaseLine } from "../renderer.js";
import { hasModeratorPermission, missingPermissionMessage } from "../permissionGuards.js";
import {
  getGlobalModerationTargets,
  globalModeration,
  globalModerationDisabledMessage,
} from "../globalModeration.js";

export class NoteCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("note")
        .setDescription("Manage private moderator notes")
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setContexts(InteractionContextType.Guild)
        .addSubcommand((command) =>
          command
            .setName("add")
            .setDescription("Add a private note")
            .addUserOption((option) => option.setName("user").setDescription("User").setRequired(true))
            .addStringOption((option) => option.setName("note").setDescription("Note").setMaxLength(1_000).setRequired(true))
            .addBooleanOption((option) =>
              option
                .setName("global")
                .setDescription("Share the note with every participating server")
                .setRequired(false),
            ),
        )
        .addSubcommand((command) =>
          command
            .setName("list")
            .setDescription("List private notes")
            .addUserOption((option) => option.setName("user").setDescription("User").setRequired(true))
            .addBooleanOption((option) =>
              option
                .setName("global")
                .setDescription("Show only notes shared through global moderation")
                .setRequired(false),
            ),
        ),
    );
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: "This command can only be used inside a server.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!hasModeratorPermission(interaction.member, PermissionFlagsBits.ModerateMembers)) {
      await interaction.reply({ content: missingPermissionMessage("ModerateMembers"), flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const user = interaction.options.getUser("user", true);
    const subcommand = interaction.options.getSubcommand();
    const isGlobal = interaction.options.getBoolean("global") ?? false;
    try {
      if (subcommand === "add") {
        const reason = interaction.options.getString("note", true).trim();
        if (!reason) {
          await interaction.editReply({ content: "The note cannot be empty." });
          return;
        }
        if (isGlobal) {
          const targets = await getGlobalModerationTargets(
            interaction.client,
            interaction.guildId,
            "note",
          );
          if (!targets.enabled) {
            await interaction.editReply({ content: globalModerationDisabledMessage() });
            return;
          }

          const { cases: createdCases } = await globalModeration.apply({
            guildIds: targets.guilds.map((guild) => guild.id), targetUserId: user.id, action: "note",
          }, (guildId) => moderationCaseService.createCase({
            guildId, targetUserId: user.id, moderatorUserId: interaction.user.id,
            action: "NOTE", reason, isGlobal: true, metadata: { originGuildId: interaction.guildId },
          }));

          const localCase = createdCases.find(
            (moderationCase) => moderationCase.guildId === interaction.guildId,
          );
          await interaction.editReply({
            content: `Global note shared with ${createdCases.length}/${targets.guilds.length} enabled servers.`,
            embeds: localCase ? [buildCaseEmbed(localCase)] : [],
          });
          return;
        }

        const moderationCase = await moderationCaseService.createCase({
          guildId: interaction.guildId,
          targetUserId: user.id,
          moderatorUserId: interaction.user.id,
          action: "NOTE",
          reason,
        });
        await interaction.editReply({ content: `Note created - Case #${moderationCase.caseNumber}`, embeds: [buildCaseEmbed(moderationCase)] });
        return;
      }

      if (isGlobal) {
        const targets = await getGlobalModerationTargets(
          interaction.client,
          interaction.guildId,
          "note",
        );
        if (!targets.enabled) {
          await interaction.editReply({ content: globalModerationDisabledMessage() });
          return;
        }
      }

      const notes = isGlobal
        ? await moderationCaseService.recentGlobalNotesForUser(interaction.guildId, user.id, 10)
        : await moderationCaseService.recentNotesForUser(interaction.guildId, user.id, 10);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Yellow)
            .setTitle(`${isGlobal ? "Global " : ""}Moderator Notes - ${user.tag}`)
            .setDescription(notes.length > 0 ? notes.map(formatCaseLine).join("\n") : "No notes found.")
            .setTimestamp(),
        ],
      });
    } catch (error) {
      logger.error({ err: error, guildId: interaction.guildId, userId: user.id }, "Note command failed");
      await interaction.editReply({ content: "I could not process that note right now." });
    }
  }
}
