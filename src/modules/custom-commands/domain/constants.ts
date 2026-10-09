export const CUSTOM_COMMAND_LIMITS = {
  commandsPerGuild: 100,
  aliases: 10,
  name: 100,
  description: 100,
  text: 2000,
  embedTitle: 256,
  embedDescription: 4096,
  embedFooter: 2048,
  embedAuthor: 256,
  embedFields: 25,
  embedFieldName: 256,
  embedFieldValue: 1024,
  embedTotal: 6000,
  url: 2048,
  modalInput: 4000,
  messages: 5,
  buttons: 5,
  buttonLabel: 80,
  buttonUrl: 512,
  componentRows: 5,
  selectOptions: 25,
  selectLabel: 100,
  selectPlaceholder: 150,
  markdownInput: 48_000,
  templateInput: 24_000,
  arguments: 25,
  argumentInput: 2000,
  cooldownSeconds: 86_400,
  restrictions: 25,
  cacheGuilds: 1000,
  cacheTtlMs: 30_000,
  cooldownEntries: 100_000,
  cooldownSweepMs: 30_000,
  importBytes: 8 * 1024 * 1024,
  pageSize: 10,
  listPageContent: 1800,
} as const;
export const TRIGGER_TYPES = ["SLASH", "MESSAGE", "BOTH"] as const;
export const RESPONSE_TYPES = ["TEXT", "EMBED", "MULTI"] as const;
export const COOLDOWN_SCOPES = [
  "USER",
  "CHANNEL",
  "GUILD",
  "GLOBAL_COMMAND",
] as const;
export const RESTRICTION_KEYS = [
  "allowedRoleIds",
  "deniedRoleIds",
  "allowedChannelIds",
  "deniedChannelIds",
  "requiredUserPermissions",
  "requiredBotPermissions",
] as const;
// Protect critical commands even before Sapphire has finished loading its store.
export const PROTECTED_COMMAND_NAMES = [
  "setup",
  "ban",
  "kick",
  "warn",
  "settings",
  "custom",
  "help",
] as const;
// Reuse the existing custom-response prefix. GuildConfig has no prefix setting.
export const CUSTOM_COMMAND_PREFIX = "!";
