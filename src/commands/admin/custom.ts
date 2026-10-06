import { Command } from "@sapphire/framework";
import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../../logger.js";
import { CUSTOM_COMMAND_LIMITS as L } from "../../lib/customCommands/constants.js";
import { CustomCommandError } from "../../lib/customCommands/errors.js";
import {
  createOptions,
  editOptions,
  extraSubcommands,
} from "../../services/customCommands/registration.js";
import { requireVerifiedOwnership } from "../../services/guildOwnershipService.js";

export class CustomCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) => {
      extraSubcommands(builder);
      return builder
        .setName("custom")
        .setDescription("Manage custom commands and member events")
        .setDefaultMemberPermissions(null)
        .setContexts(InteractionContextType.Guild)
        .addSubcommand((sub) =>
          createOptions(
            sub
              .setName("create")
              .setDescription("Create a custom command or event"),
          ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("list")
            .setDescription("List saved custom commands and events")
            .addIntegerOption((o) =>
              o.setName("page").setDescription("Page number").setMinValue(1),
            ),
        )
        .addSubcommand((sub) =>
          editOptions(
            sub
              .setName("edit")
              .setDescription(
                "Edit a command; configure opens the template editor",
              ),
          ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("enable")
            .setDescription("Enable or disable a rule")
            .addStringOption((o) =>
              o
                .setName("name")
                .setDescription("Rule name")
                .setRequired(true)
                .setMaxLength(L.name),
            )
            .addBooleanOption((o) =>
              o.setName("enabled").setDescription("Default: enabled"),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("delete")
            .setDescription("Delete a rule")
            .addStringOption((o) =>
              o
                .setName("name")
                .setDescription("Rule name")
                .setRequired(true)
                .setMaxLength(L.name),
            ),
        );
    });
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ) {
    const deny = async (content: string) => {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content });
      } else {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      }
    };
    if (!interaction.inCachedGuild()) {
      await deny("Use this command in a server.");
      return;
    }
    const subcommand = interaction.options.getSubcommand();
    if (
      subcommand !== "run" &&
      interaction.user.id !== interaction.guild.ownerId &&
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      await deny(
        "Only the server owner or an administrator can manage custom rules.",
      );
      return;
    }
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }
    if (!(await requireVerifiedOwnership(interaction))) return;
    const guildId = interaction.guildId;
    try {
      const { customCommandService } =
        await import("../../services/customCommands/runtime.js");
      const modern =
        subcommand === "create"
          ? !interaction.options.getString("kind")
          : ["edit", "enable", "delete"].includes(subcommand)
            ? Boolean(
                await customCommandService.getCommand(
                  guildId,
                  interaction.options.getString("name", true),
                ),
              )
            : subcommand !== "list";
      if (modern) {
        const { handleCustomManagement } =
          await import("../../services/customCommands/management.js");
        await handleCustomManagement(interaction);
        return;
      }
      const { handleLegacyCustomResponse } =
        await import("../../services/customCommands/legacyManagement.js");
      await handleLegacyCustomResponse(interaction);
    } catch (error) {
      if (error instanceof CustomCommandError) {
        await interaction.editReply({
          content: error.message,
          allowedMentions: { parse: [] },
        });
      } else if (
        error instanceof Error &&
        /^(Name|Command trigger|Join and leave|Response|Cooldown|This server|A response|That command)/.test(
          error.message,
        )
      ) {
        await interaction.editReply(error.message);
      } else {
        logger.error(
          {
            errorType: error instanceof Error ? error.name : "Unknown",
            guildId,
          },
          "custom_command.management_failed",
        );
        await interaction.editReply(
          "I could not save that custom rule right now.",
        );
      }
    }
  }
}
