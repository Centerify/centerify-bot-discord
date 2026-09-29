import { Precondition } from "@sapphire/framework";
import type { ChatInputCommandInteraction, ContextMenuCommandInteraction, Message } from "discord.js";
import { MessageFlags } from "discord.js";
import { guildOwnershipService, OWNERSHIP_REQUIRED_MESSAGE, requireVerifiedOwnership } from "../services/guildOwnershipService.js";

export class VerifiedGuildOwnershipPrecondition extends Precondition {
  public constructor(context: Precondition.LoaderContext, options: Precondition.Options) {
    super(context, { ...options, position: 0 });
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    if (interaction.commandName === "verify" || interaction.commandName === "unverify") return this.ok();
    // Ownership checks make REST and database requests before the command runs.
    if (["settings", "setup"].includes(interaction.commandName) && !interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }
    return this.checkInteraction(interaction);
  }

  public override async contextMenuRun(interaction: ContextMenuCommandInteraction) {
    return this.checkInteraction(interaction);
  }

  public override async messageRun(message: Message) {
    if (message.guild && await guildOwnershipService.isVerified(message.guild)) return this.ok();
    return this.error({ identifier: "GuildOwnershipRequired", message: OWNERSHIP_REQUIRED_MESSAGE });
  }

  private async checkInteraction(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction) {
    if (await requireVerifiedOwnership(interaction)) return this.ok();
    return this.error({ identifier: "GuildOwnershipRequired", message: OWNERSHIP_REQUIRED_MESSAGE });
  }
}
