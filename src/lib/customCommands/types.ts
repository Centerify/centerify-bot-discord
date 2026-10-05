import type {
  APIEmbed,
  Guild,
  GuildMember,
  GuildTextBasedChannel,
  MessageCreateOptions,
  PermissionsString,
} from "discord.js";
import type {
  COOLDOWN_SCOPES,
  RESPONSE_TYPES,
  TRIGGER_TYPES,
} from "./constants.js";
export type TriggerType = (typeof TRIGGER_TYPES)[number];
export type ResponseType = (typeof RESPONSE_TYPES)[number];
export type CooldownScope = (typeof COOLDOWN_SCOPES)[number];
export interface EmbedTemplate extends Omit<
  APIEmbed,
  "type" | "video" | "provider" | "timestamp"
> {
  timestamp?: boolean | string;
}
export type ResponseTemplate =
  { type: "TEXT"; text: string } | { type: "EMBED"; embed: EmbedTemplate };
export interface CustomCommandDefinition {
  name: string;
  description: string;
  enabled: boolean;
  triggerType: TriggerType;
  responseType: ResponseType;
  content: ResponseTemplate[];
  aliases: string[];
  allowedRoleIds: string[];
  deniedRoleIds: string[];
  allowedChannelIds: string[];
  deniedChannelIds: string[];
  requiredUserPermissions: PermissionsString[];
  requiredBotPermissions: PermissionsString[];
  cooldownSeconds: number;
  cooldownScope: CooldownScope;
  deleteInvocation: boolean;
  replyToInvocation: boolean;
}
export interface CustomCommandRecord extends CustomCommandDefinition {
  id: number;
  guildId: string;
  /** Shared commands retain their source identity for execution and editing. */
  sourceGuildId?: string;
  sharingScope?: "server" | "all" | "selected";
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
  lastUsedAt: string | null;
}
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
export interface VariableResolver {
  key: string;
  resolve(context: CustomCommandExecutionContext): string | Promise<string>;
}
export interface CustomCommandTransaction {
  list(): Promise<CustomCommandRecord[]>;
  legacyNames(): Promise<string[]>;
  save(
    definition: CustomCommandDefinition,
    actorId: string,
    id?: number,
  ): Promise<CustomCommandRecord>;
  remove(id: number): Promise<void>;
}
export interface CustomCommandRepository {
  list(guildId: string): Promise<CustomCommandRecord[]>;
  mutate<T>(
    guildId: string,
    operation: (tx: CustomCommandTransaction) => Promise<T>,
  ): Promise<T>;
  recordUsage(guildId: string, commandId: number): Promise<void>;
}
