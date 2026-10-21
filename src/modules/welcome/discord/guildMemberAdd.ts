import type { GuildMember } from "discord.js";
import { logger } from "../../../adapters/logging/runtime.js";
import { guildConfigService } from "../../guilds/discord/index.js";
import { guildOwnershipService } from "../../guilds/discord/index.js";
import { greetingService } from "../../welcome/discord/greeting.js";
import { validateAssignableRole } from "../../guilds/discord/index.js";

export class GuildMemberAddListener {
  public async run(member: GuildMember) {
    if (!(await guildOwnershipService.isVerified(member.guild))) {
      return;
    }

    const config = await guildConfigService.getOrCreate(member.guild.id).catch((error) => {
      logger.error(
        { err: error, guildId: member.guild.id, userId: member.id },
        "Failed to load guild config for member join",
      );
      return null;
    });

    if (!config) {
      return;
    }

    if (config.autoRoleEnabled && config.autoRoleId) {
      await this.assignAutoRole(member, config.autoRoleId);
    }

    await greetingService.sendWelcome(config, member);
  }

  private async assignAutoRole(member: GuildMember, roleId: string) {
    const role = await member.guild.roles.fetch(roleId, { force: true }).catch((error) => {
      logger.warn({ err: error, guildId: member.guild.id, roleId }, "Failed to fetch auto role");
      return null;
    });

    await member.guild.members.fetchMe({ force: true });

    if (!role || validateAssignableRole(member.guild, role)) {
      logger.warn(
        { guildId: member.guild.id, roleId },
        "Configured auto role is unavailable or invalid",
      );
      return;
    }

    await member.roles.add(role).catch((error) => {
      logger.warn(
        { err: error, guildId: member.guild.id, userId: member.id, roleId },
        "Failed to assign auto role",
      );
    });
  }
}
