import { serviceRef } from "../../../adapters/discord/context.js";
import { customCommandsToken } from "../index.js";
import { executorToken, sharingToken } from "./tokens.js";
import type { Message } from "discord.js";
import {
  CUSTOM_COMMAND_PREFIX as PREFIX,
  CUSTOM_COMMAND_LIMITS as L,
} from "../domain/constants.js";
import {
  CustomCommandArgumentError,
  CustomCommandError,
} from "../domain/errors.js";
import { parseArguments } from "./CustomCommandVariableResolver.js";

import type { Client, Guild } from "discord.js";
export const customCommandService = serviceRef(customCommandsToken);
export const customCommandExecutor = serviceRef(executorToken);
export const customCommandSharingService = serviceRef(sharingToken);

export async function resolveExecutableCustomCommand(
  client: Client,
  guild: Guild,
  name: string,
) {
  const local = await customCommandService.getCommandByNameOrAlias(
    guild.id,
    name,
  );
  return local ?? customCommandSharingService.resolve(client, guild, name);
}

/** Called only after the existing message listener has checked guild ownership. */
export async function runDomainCustomCommand(
  message: Message,
): Promise<boolean> {
  if (
    !message.guild ||
    !message.member ||
    message.author.bot ||
    message.webhookId ||
    message.system ||
    !message.content.startsWith(PREFIX)
  )
    return false;
  if (message.content.length > L.argumentInput + L.name + PREFIX.length + 1)
    return false;
  let space = -1;
  for (let i = PREFIX.length; i < message.content.length; i++) {
    const char = message.content.charCodeAt(i);
    if (char === 32 || char === 9 || char === 10 || char === 13) {
      space = i;
      break;
    }
  }
  // Split on whitespace only after the fast prefix and length checks.
  const end = space < 0 ? message.content.length : space;
  const rawName = message.content.slice(PREFIX.length, end);
  if (!rawName || rawName.length > L.name) return false;
  const command = await resolveExecutableCustomCommand(
    message.client,
    message.guild,
    rawName,
  );
  if (!command) return false;
  const member = message.member;
  const channel = message.channel;
  if (channel.isDMBased() || !("send" in channel)) return true;
  try {
    const args = parseArguments(
      space < 0 ? "" : message.content.slice(space + 1),
    );
    await customCommandExecutor.execute(
      {
        guildId: message.guild.id,
        channelId: channel.id,
        userId: member.id,
        guild: message.guild,
        channel,
        member,
        command,
        args,
        source: "message",
      },
      {
        send: (payload, index) =>
          index === 0 && command.replyToInvocation && !command.deleteInvocation
            ? message.reply(payload)
            : channel.send(payload),
        deleteInvocation: () => message.delete(),
      },
    );
  } catch (error) {
    if (!(error instanceof CustomCommandError)) throw error;
    if (error instanceof CustomCommandArgumentError) {
      await message.reply({
        content: error.message,
        allowedMentions: { parse: [], repliedUser: false },
      });
    }
    // Expected access denials are quiet on prefix messages, as in existing commands.
  }
  return true;
}
