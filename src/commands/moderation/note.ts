import { Command } from "@sapphire/framework";
import { Colors, EmbedBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits } from "discord.js";
import { logger } from "../../logger.js";
import { moderationCaseService } from "../../services/moderation/caseService.js";
import { buildCaseEmbed, formatCaseLine } from "../../services/moderation/renderer.js";
import { hasModeratorPermission, missingPermissionMessage } from "../../services/moderation/permissionGuards.js";

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
            .addStringOption((option) => option.setName("note").setDescription("Note").setMaxLength(1_000).setRequired(true)),
        )
        .addSubcommand((command) =>
          command
            .setName("list")
            .setDescription("List private notes")
            .addUserOption((option) => option.setName("user").setDescription("User").setRequired(true)),
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
    try {
      if (subcommand === "add") {
        const moderationCase = await moderationCaseService.createCase({
          guildId: interaction.guildId,
          targetUserId: user.id,
          moderatorUserId: interaction.user.id,
          action: "NOTE",
          reason: interaction.options.getString("note", true).trim(),
        });
        await interaction.editReply({ content: `Note created - Case #${moderationCase.caseNumber}`, embeds: [buildCaseEmbed(moderationCase)] });
        return;
      }

      const notes = await moderationCaseService.recentNotesForUser(interaction.guildId, user.id, 10);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Yellow)
            .setTitle(`Moderator Notes - ${user.tag}`)
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
