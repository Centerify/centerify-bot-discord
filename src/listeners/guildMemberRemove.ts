import { Listener } from "@sapphire/framework";
import { Events, type GuildMember, type PartialGuildMember } from "discord.js";
import { logger } from "../logger.js";
import { guildConfigService } from "../services/guildConfigService.js";
import { greetingService } from "../services/greetingService.js";

export class GuildMemberRemoveListener extends Listener<typeof Events.GuildMemberRemove> {
  public constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, { ...options, event: Events.GuildMemberRemove });
  }

  public override async run(member: GuildMember | PartialGuildMember) {
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
