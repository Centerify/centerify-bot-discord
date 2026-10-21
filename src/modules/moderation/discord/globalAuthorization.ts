import { PermissionFlagsBits, type Guild, type GuildMember } from "discord.js";
import { commandRoleDenial } from "../../guilds/index.js";
import { guildConfigService, guildOwnershipService } from "../../guilds/discord/index.js";
import type { GlobalAction } from "../application/GlobalModeration.js";

/** Source-server permissions never confer authority in another server. */
export async function authorizeGlobalModerator(
  guild: Guild,
  actorId: string,
  action: GlobalAction,
): Promise<GuildMember | null> {
  try {
    const current = await guild.fetch();
    if (!(await guildOwnershipService.isVerified(current))) return null;
    const [member, config] = await Promise.all([
      current.members.fetch({ user: actorId, force: true }),
      guildConfigService.getOrCreate(current.id),
    ]);
    const enabled = {
      ban: config.globalBanEnabled,
      warn: config.globalWarnEnabled,
      note: config.globalNoteEnabled,
    }[action];
    const permission =
      action === "ban" ? PermissionFlagsBits.BanMembers : PermissionFlagsBits.ModerateMembers;
    if (
      !enabled ||
      member.guild.id !== current.id ||
      member.id !== actorId ||
      !member.permissions.has(permission) ||
      commandRoleDenial(config.commandRoleAccess, action, new Set(member.roles.cache.keys()))
    )
      return null;
    return member;
  } catch {
    // Missing membership, API failures and unverifiable ownership all deny access.
    return null;
  }
}
