export type XpConfig = { guildId: string; xpEnabled: boolean; xpSharing: string; xpSharedGuildIds: string };

export function parseSharedGuildIds(value: string): string[] {
  if (value.trim().toLowerCase() === "clear") return [];
  const ids = [...new Set(value.split(",").map((id) => id.trim()))];
  if (ids.length > 25 || ids.some((id) => !/^\d{17,20}$/.test(id))) throw new Error("Invalid server IDs");
  return ids;
}

export function sharedXpGuildIds(source: XpConfig, configs: XpConfig[]): string[] {
  const ids = new Set([source.guildId]);
  if (!source.xpEnabled) return [...ids];
  const selected = source.xpSharedGuildIds.split(",");
  for (const target of configs) {
    if (!target.xpEnabled) continue;
    if (source.xpSharing === "global" && target.xpSharing === "global") ids.add(target.guildId);
    if (source.xpSharing === "selected" && target.xpSharing === "selected"
      && selected.includes(target.guildId) && target.xpSharedGuildIds.split(",").includes(source.guildId)) ids.add(target.guildId);
  }
  return [...ids];
}

export function xpProgress(xp: number) {
  const level = Math.floor(Math.sqrt(xp / 100));
  return { level, progress: xp - 100 * level ** 2, required: 100 * (2 * level + 1) };
}

export const XP_METHOD_CHOICES = [
  { name: "Messages", value: "messages" },
  { name: "Reactions", value: "reactions" },
  { name: "Daily claim", value: "daily" },
  { name: "Messages + reactions", value: "messages,reactions" },
  { name: "Messages + daily claim", value: "messages,daily" },
  { name: "Reactions + daily claim", value: "reactions,daily" },
  { name: "All methods", value: "messages,reactions,daily" },
] as const;

export type XpMethod = "messages" | "reactions" | "daily";

export function earningRule(config: {
  xpEnabled: boolean; xpMethods: string; xpMessageAmount: number;
  xpReactionAmount: number; xpDailyAmount: number; xpCooldownSeconds: number;
}, method: XpMethod) {
  if (!config.xpEnabled || !config.xpMethods.split(",").includes(method)) return null;
  const amount = method === "messages" ? config.xpMessageAmount
    : method === "reactions" ? config.xpReactionAmount : config.xpDailyAmount;
  const cooldownSeconds = method === "daily" ? 86_400 : config.xpCooldownSeconds;
  if (!Number.isInteger(amount) || amount < 1 || amount > 10_000
    || !Number.isInteger(cooldownSeconds) || cooldownSeconds < 10 || cooldownSeconds > 86_400) return null;
  return { amount, cooldownSeconds };
}
