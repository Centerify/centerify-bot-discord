import { Command } from "@sapphire/framework";
import { Colors, EmbedBuilder, InteractionContextType, MessageFlags } from "discord.js";
import { logger } from "../../logger.js";
import { xpService } from "../../services/xpService.js";
import { xpProgress } from "../../services/xpPolicy.js";

export class XpCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) => builder.setName("xp").setDescription("View XP, levels, and the leaderboard")
      .setContexts(InteractionContextType.Guild)
      .addSubcommand((option) => option.setName("daily").setDescription("Claim your daily XP reward"))
      .addSubcommand((option) => option.setName("rank").setDescription("View your XP or another member's XP")
        .addUserOption((user) => user.setName("user").setDescription("Member to view").setRequired(false)))
      .addSubcommand((option) => option.setName("leaderboard").setDescription("View the top 10 XP earners")));
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: "This command can only be used inside a server.", flags: MessageFlags.Ephemeral });
      return;
    }
    const daily = interaction.options.getSubcommand() === "daily";
    await interaction.deferReply(daily ? { flags: MessageFlags.Ephemeral } : {});
    try {
      if (daily) {
        const result = await xpService.earn(interaction.guildId, interaction.user.id, "daily");
        const content = result.status === "awarded" ? `You earned ${result.amount} daily XP!`
          : result.status === "disabled" ? "Daily XP earning is disabled in this server."
          : "You have already claimed daily XP. Try again 24 hours after your last claim.";
        await interaction.editReply({ content });
        return;
      }
      const leaderboard = interaction.options.getSubcommand() === "leaderboard";
      const user = interaction.options.getUser("user") ?? interaction.user;
      const totals = await xpService.totals(interaction.guildId, leaderboard ? undefined : user.id);
      const embed = new EmbedBuilder().setColor(Colors.Blurple);
      if (leaderboard) {
        embed.setTitle("XP Leaderboard").setDescription(totals.slice(0, 10).map((row, index) =>
          `${index + 1}. <@${row.userId}> — ${row.xp} XP • Level ${xpProgress(row.xp).level}`
        ).join("\n") || "No XP has been earned yet.");
      } else {
        const xp = totals[0]?.xp ?? 0;
        const progress = xpProgress(xp);
        embed.setTitle("Member XP").setDescription(`<@${user.id}>`).addFields(
          { name: "XP", value: String(xp), inline: true },
          { name: "Level", value: String(progress.level), inline: true },
          { name: "Next Level", value: `${progress.progress} / ${progress.required} XP`, inline: true },
        );
      }
      await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch (error) {
      logger.error({ err: error, guildId: interaction.guildId }, "Failed to load XP");
      await interaction.editReply({ content: "I could not load XP right now." });
    }
  }
}
