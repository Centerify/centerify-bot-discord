import type { Guild, Role } from "discord.js";
import { warningRoleSettings, type WarningRoleSettings } from "../../guilds/index.js";
import { guildConfigService } from "../../guilds/discord/index.js";
import { getWarnRoleName } from "./warningRoleNames.js";

export async function loadWarningRoleSettings(guildId: string) {
  return warningRoleSettings((await guildConfigService.getOrCreate(guildId)).warningRoleSettings);
}

export async function getOrCreateWarnRole(guild: Guild, count: number, settings: WarningRoleSettings): Promise<Role | null> {
  if (settings.mode === "none") return null;
  if (settings.mode === "single" && settings.singleRoleId) {
    const selected = await guild.roles.fetch(settings.singleRoleId);
    if (!selected) throw new Error("The selected shared warning role no longer exists. Update Warning Roles in /settings.");
    return selected;
  }
  const name = settings.mode === "single" ? settings.singleName : getWarnRoleName(count, settings.numberedName);
  await guild.roles.fetch();
  const existing = guild.roles.cache.find((role) => role.name === name && role.id !== guild.id && !role.managed);
  if (existing) return existing;
  return guild.roles.create({
    name, colors: { primaryColor: settings.color }, hoist: settings.hoist,
    mentionable: settings.mentionable, reason: `Created role for warning count ${count}`,
  });
}

/** Call only after confirming the moderator and bot can manage this role. */
export async function applyWarningRoleStyle(role: Role, settings: WarningRoleSettings): Promise<void> {
  if (role.color === settings.color && role.hoist === settings.hoist && role.mentionable === settings.mentionable) return;
  await role.edit({ colors: { primaryColor: settings.color }, hoist: settings.hoist,
    mentionable: settings.mentionable, reason: "Applied server warning role settings" });
}
