import type { Message, MessageReaction, PartialMessageReaction, User, PartialUser } from "discord.js";
import { guildOwnershipService } from "../../guilds/discord/index.js";
import { xpService } from "./services.js";
export async function onXpMessage(message: Message) {
  if (!message.guild || message.author.bot || message.webhookId || message.system) return;
  if (!await guildOwnershipService.isVerified(message.guild)) return;
  await xpService.award(message.guild.id, message.author.id);
}
export async function onXpReaction(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
  const reactor = user.partial ? await user.fetch() : user;
  if (reactor.bot) return;
  const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
  if (!message.guild || message.author.bot || message.webhookId || message.system || message.author.id === reactor.id) return;
  if (!await guildOwnershipService.isVerified(message.guild)) return;
  await xpService.award(message.guild.id, reactor.id, "reactions");
}
