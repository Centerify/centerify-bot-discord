import type { Guild, GuildMember, GuildTextBasedChannel, MessageCreateOptions } from "discord.js";
import type { CustomCommandRecord } from "../domain/types.js";
export interface CustomCommandExecutionContext {
  guildId: string;
  channelId: string;
  userId: string;
  guild: Guild;
  channel: GuildTextBasedChannel;
  member: GuildMember;
  command: CustomCommandRecord;
  args: string[];
  source: "message" | "slash" | "button" | "internal";
}
export interface CustomCommandTransport {
  send(payload: MessageCreateOptions, index: number): Promise<unknown>;
  deleteInvocation?(): Promise<unknown>;
}
export interface CustomCommandExecutionPort {
  execute(context: CustomCommandExecutionContext, transport: CustomCommandTransport): Promise<void>;
}
export interface VariableResolver {
  key: string;
  resolve(context: CustomCommandExecutionContext): string | Promise<string>;
}
