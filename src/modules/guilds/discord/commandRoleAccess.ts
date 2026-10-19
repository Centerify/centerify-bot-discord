import { Precondition, type Command } from "@sapphire/framework";
import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
} from "discord.js";
import { commandRoleAccess, commandRoleDenial, PROTECTED_ACCESS_COMMANDS } from "../index.js";
import { guildConfigService } from "./config.js";
import { logger } from "../../../adapters/logging/runtime.js";

/** Additional role restrictions; the command still checks its Discord permissions. */
export class CommandRoleAccessPrecondition extends Precondition {
  constructor(context: Precondition.LoaderContext, options: Precondition.Options) {
    super(context, { ...options, position: 1 });
  }

  override async chatInputRun(interaction: ChatInputCommandInteraction, command?: Command) {
    const commandName = command?.name ?? interaction.commandName;
    if (
      !interaction.inCachedGuild() ||
      PROTECTED_ACCESS_COMMANDS.some((name) => name === commandName)
    )
      return this.ok();
    let denial: string | null;
    try {
      const config = await guildConfigService.getOrCreate(interaction.guildId);
      const rule = commandRoleAccess(config.commandRoleAccess)[commandName];
      if (!rule || (!rule.allowedRoleIds.length && !rule.deniedRoleIds.length)) return this.ok();
      const member = await interaction.guild.members.fetch({
        user: interaction.user.id,
        force: true,
      });
      denial = commandRoleDenial(
        config.commandRoleAccess,
        commandName,
        new Set(member.roles.cache.keys()),
      );
    } catch (error) {
      logger.error(
        { err: error, guildId: interaction.guildId, command: interaction.commandName },
        "Could not check command role access",
      );
      denial = "I could not check your command access right now. Please try again.";
    }
    if (!denial) return this.ok();
    const reply: InteractionReplyOptions = {
      content: denial,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    };
    if (interaction.deferred || interaction.replied) await interaction.followUp(reply);
    else await interaction.reply(reply);
    return this.error({ identifier: "CommandRoleAccessDenied", message: denial });
  }
}
