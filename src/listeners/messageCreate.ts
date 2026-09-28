import { Listener } from "@sapphire/framework";
import { Events, type Message } from "discord.js";
import { logger } from "../logger.js";
import { guildOwnershipService } from "../services/guildOwnershipService.js";
import { xpService } from "../services/xpService.js";

export class MessageCreateListener extends Listener<typeof Events.MessageCreate> {
  public constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, { ...options, event: Events.MessageCreate });
  }

  public override async run(message: Message) {
    if (!message.guild || message.author.bot || message.webhookId || message.system) return;
    try {
      if (!await guildOwnershipService.isVerified(message.guild)) return;
      await xpService.award(message.guild.id, message.author.id);
    } catch (error) {
      logger.error({ err: error, guildId: message.guild.id, userId: message.author.id }, "Failed to award message XP");
    }
  }
}
