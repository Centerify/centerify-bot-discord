import type { PermissionName } from "./permissions.js";
import type {
  COOLDOWN_SCOPES,
  RESPONSE_TYPES,
  TRIGGER_TYPES,
} from "./constants.js";
export type TriggerType = (typeof TRIGGER_TYPES)[number];
export type ResponseType = (typeof RESPONSE_TYPES)[number];
export type CooldownScope = (typeof COOLDOWN_SCOPES)[number];
export interface EmbedTemplate {
  title?: string; description?: string; url?: string; color?: number; timestamp?: boolean | string;
  footer?: { text: string; icon_url?: string; proxy_icon_url?: string };
  image?: { url: string; proxy_url?: string; height?: number; width?: number };
  thumbnail?: { url: string; proxy_url?: string; height?: number; width?: number };
  author?: { name: string; url?: string; icon_url?: string; proxy_icon_url?: string };
  fields?: { name: string; value: string; inline?: boolean }[];
}
export interface LinkButtonTemplate {
  label: string;
  url: string;
}
export type NavigationAction =
  | { action: "go" | "back"; target: number }
  | { action: "main" | "cancel" };
export interface EffectOptions {
  /** Override the private acknowledgement with a variable-enabled template. */
  successMessage?: string;
  /** Roles repeat by default; other effects run once per control by default. */
  repeatable?: boolean;
}
export type RoleAction = { action: "addrole" | "removerole" | "togglerole"; roleId: string; userId?: string } & EffectOptions;
export type EffectAction = (
  | RoleAction
  | { action: "warn"; userId: string; reason: string; durationMs?: number }
  | { action: "unwarn"; userId: string; reason: string; caseNumber?: number }
  | { action: "note" | "kick" | "unban" | "removetimeout"; userId: string; reason: string }
  | { action: "timeout"; userId: string; reason: string; durationMs: number }
  | { action: "ban"; userId: string; reason: string; deleteMessageSeconds?: number }
  | { action: "setnickname"; userId: string; nickname: string }
  | { action: "reply"; text: string }
  | { action: "sendmessage"; text: string; channelId?: string }
) & EffectOptions;
export type SequenceAction = { action: "sequence"; actions: EffectAction[] } & EffectOptions;
export type ComponentAction = NavigationAction | EffectAction | SequenceAction;
export type ActionButtonTemplate = ComponentAction & {
  label: string;
  style?: "primary" | "secondary" | "success" | "danger";
};
export type SelectOptionTemplate = ComponentAction & {
  label: string;
  description?: string;
};
export interface SelectTemplate {
  placeholder: string;
  options: SelectOptionTemplate[];
}
export type ButtonTemplate = LinkButtonTemplate | ActionButtonTemplate;
export type ResponseTemplate = (
  { type: "TEXT"; text: string } | { type: "EMBED"; embed: EmbedTemplate }
) & { buttons?: ButtonTemplate[]; selects?: SelectTemplate[]; stage?: number };
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
  requiredUserPermissions: PermissionName[];
  requiredBotPermissions: PermissionName[];
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
export interface CommandExecutionIdentity {
  guildId: string; channelId: string; userId: string; command: CustomCommandRecord;
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
