import { Listener } from "@sapphire/framework";
import { Events, type MessageReaction, type PartialMessageReaction, type User, type PartialUser } from "discord.js";
import { logger } from "../logger.js";
import { guildOwnershipService } from "../services/guildOwnershipService.js";
import { xpService } from "../services/xpService.js";

export class MessageReactionAddListener extends Listener<typeof Events.MessageReactionAdd> {
  public constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, { ...options, event: Events.MessageReactionAdd });
  }

  public override async run(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
    try {
      const reactor = user.partial ? await user.fetch() : user;
      if (reactor.bot) return;
      const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
      if (!message.guild || message.author.bot || message.webhookId || message.system || message.author.id === reactor.id) return;
      if (!await guildOwnershipService.isVerified(message.guild)) return;
      // The member who adds a reaction earns XP; self-reactions do not count.
      await xpService.award(message.guild.id, reactor.id, "reactions");
    } catch (error) {
      logger.error({ err: error, userId: user.id }, "Failed to award reaction XP");
    }
  }
}
