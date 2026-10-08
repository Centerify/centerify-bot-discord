import { Command } from "@sapphire/framework";
import { InteractionContextType, PermissionFlagsBits } from "discord.js";
import { warnMember } from "../services.js";
import { runWarn } from "../warn.js";

export class WarnCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("warn")
        .setDescription("Create a warning for a member")
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setContexts(InteractionContextType.Guild)
        .addUserOption((option) =>
          option.setName("user").setDescription("Member to warn").setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for the warning")
            .setMaxLength(1_000)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("duration")
            .setDescription("Optional duration like 10m, 1h, 1d, 7d")
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName("global")
            .setDescription("Warn the member in every participating server they share")
            .setRequired(false),
        ),
    );
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    return runWarn(interaction, warnMember);
  }
}
