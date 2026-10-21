import type { Message } from "discord.js";
import { guildOwnershipService } from "../../guilds/discord/index.js";
import { runDomainCustomCommand } from "./runtime.js";
import { runCustomCommand } from "./legacyRunner.js";
import { CUSTOM_COMMAND_PREFIX } from "../domain/constants.js";
export async function onCustomCommandMessage(message: Message) {
  if (!message.guild || message.author.bot || message.webhookId || message.system) return;
  if (!message.content?.startsWith(CUSTOM_COMMAND_PREFIX)) return;
  if (!await guildOwnershipService.isVerified(message.guild)) return;
  if (await runDomainCustomCommand(message)) return;
  await runCustomCommand(message);
}
