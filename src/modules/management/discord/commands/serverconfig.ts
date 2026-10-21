import { Command } from "@sapphire/framework";
import {
  GuildVerificationLevel,
  InteractionContextType,
  PermissionFlagsBits as P,
} from "discord.js";
import { ManagementError, runManagement } from "../guards.js";

export class ServerConfigCommand extends Command {
  override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("serverconfig")
        .setDescription("Update Discord server settings")
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(P.ManageGuild)
        .addStringOption((o) =>
          o.setName("name").setDescription("New server name").setMinLength(2).setMaxLength(100),
        )
        .addStringOption((o) =>
          o
            .setName("description")
            .setDescription("Server description; requires a Community server")
            .setMaxLength(120),
        )
        .addIntegerOption((o) =>
          o
            .setName("verification")
            .setDescription("Member verification level")
            .setChoices(
              { name: "None", value: 0 },
              { name: "Low", value: 1 },
              { name: "Medium", value: 2 },
              { name: "High", value: 3 },
              { name: "Very high", value: 4 },
            ),
        )
        .addIntegerOption((o) =>
          o
            .setName("afk_timeout")
            .setDescription("Voice AFK timeout in seconds")
            .setChoices(
              ...[60, 300, 900, 1800, 3600].map((value) => ({ name: `${value} seconds`, value })),
            ),
        ),
    );
  }

  override async chatInputRun(input: Command.ChatInputCommandInteraction) {
    await runManagement(input, P.ManageGuild, async ({ interaction, guild, reason }) => {
      const name = interaction.options.getString("name")?.trim();
      const description = interaction.options.getString("description");
      const verificationLevel = interaction.options.getInteger("verification");
      const afkTimeout = interaction.options.getInteger("afk_timeout");
      if (name !== undefined && name.length < 2)
        throw new ManagementError("The server name must have at least two characters.");
      if (!name && description === null && verificationLevel === null && afkTimeout === null)
        throw new ManagementError("Choose at least one server setting to change.");
      await guild.edit({
        ...(name ? { name } : {}),
        ...(description !== null ? { description: description || null } : {}),
        ...(verificationLevel !== null
          ? { verificationLevel: verificationLevel as GuildVerificationLevel }
          : {}),
        ...(afkTimeout !== null ? { afkTimeout: afkTimeout as 60 | 300 | 900 | 1800 | 3600 } : {}),
        reason,
      });
      return "Updated the server settings.";
    });
  }
}
