import type { Message } from "discord.js";
import { guildOwnershipService } from "../../guilds/discord/index.js";
import { runDomainCustomCommand } from "./runtime.js";
import { runCustomCommand } from "./legacyRunner.js";
import { customCommandPrefix } from "./configuration.js";
export async function onCustomCommandMessage(message: Message) {
  if (!message.guild || message.author.bot || message.webhookId || message.system) return;
  if (!message.content?.startsWith(customCommandPrefix())) return;
  if (!(await guildOwnershipService.isVerified(message.guild))) return;
  if (await runDomainCustomCommand(message)) return;
  await runCustomCommand(message);
}
