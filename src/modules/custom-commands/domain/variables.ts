import { CUSTOM_COMMAND_LIMITS as L } from "./constants.js";
import { CustomCommandValidationError } from "./errors.js";
export const URL_VARIABLES = [
  "user.avatar",
  "user.defaultAvatar",
  "member.avatar",
  "guild.icon",
  "guild.banner",
  "bot.avatar",
] as const;
export const TEMPLATE_VARIABLE_KEYS = ["user.id", "user.name", "user.displayName", "user.mention", "user.avatar", "user.defaultAvatar", "user.globalName", "user.createdAt", "user.bot", "member.avatar", "member.nickname", "member.joinedAt", "member.boostingSince", "member.color", "member.topRole", "member.roleCount", "guild.icon", "guild.banner", "guild.ownerId", "guild.createdAt", "guild.description", "guild.boostCount", "guild.boostTier", "guild.locale", "guild.id", "guild.name", "guild.memberCount", "channel.id", "channel.name", "channel.mention", "channel.topic", "channel.createdAt", "channel.type", "channel.nsfw", "channel.parentId", "bot.id", "bot.name", "bot.mention", "bot.avatar", "command.description", "command.usageCount", "command.cooldown", "command.prefix", "command.source", "args.count", "args.first", "args.last", "timestamp", "datetime", "command.name", "date", "time", "args"] as const;

export function templateTokens(template: string, keys: ReadonlySet<string> = new Set(TEMPLATE_VARIABLE_KEYS)) {
  if (template.length > L.templateInput) throw new CustomCommandValidationError("Template is too long.");
  const tokens: { start: number; end: number; key: string }[] = [];
  for (let i = 0; i < template.length; i++) {
    if (template[i] === "}") throw new CustomCommandValidationError("Unmatched template brace.");
    if (template[i] !== "{") continue;
    const end = template.indexOf("}", i + 1);
    if (end === -1) throw new CustomCommandValidationError("Unmatched template brace.");
    const key = template.slice(i + 1, end);
    if (!keys.has(key) && !/^args\.(?:[0-9]|1[0-9]|2[0-4])$/.test(key)) {
      throw new CustomCommandValidationError(`Unknown variable {${key.slice(0, L.name)}}.`);
    }
    tokens.push({ start: i, end: end + 1, key });
    i = end;
  }
  return tokens;
}
export const templateSyntax = { validate(template: string) { templateTokens(template); } };
