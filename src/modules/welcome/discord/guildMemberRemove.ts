import { Events, type GuildMember, type PartialGuildMember } from "discord.js";
import { logger } from "../../../adapters/logging/runtime.js";
import { guildConfigService } from "../../guilds/discord/index.js";
import { guildOwnershipService } from "../../guilds/discord/index.js";
import { greetingService } from "../../welcome/discord/greeting.js";

export class GuildMemberRemoveListener {
  public async run(member: GuildMember | PartialGuildMember) {
    if (!await guildOwnershipService.isVerified(member.guild)) {
      return;
    }

    const config = await guildConfigService.getOrCreate(member.guild.id).catch((error) => {
      logger.error(
        { err: error, guildId: member.guild.id, userId: member.id },
        "Failed to load guild config for member leave",
      );
      return null;
    });

    if (!config) {
      return;
    }

    await greetingService.sendGoodbye(config, member);
  }
}
