import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
  type PartialGuildMember,
} from "discord.js";
import { logger } from "../../../adapters/logging/runtime.js";
import type { GuildConfig } from "../../guilds/discord/index.js";
import { greetingTemplateVariables } from "./variables.js";
import { PlanGreeting } from "../application/PlanGreeting.js";
import { serviceToken } from "../../../core/index.js";
import { serviceRef } from "../../../adapters/discord/context.js";

type GreetingKind = "welcome" | "goodbye";

type GreetingMember = GuildMember | PartialGuildMember;

export class GreetingService {
  constructor(private readonly planner = new PlanGreeting()) {}
  public renderWelcome(config: GuildConfig, member: GuildMember) {
    return this.renderTemplate(config.welcomeMessage, member, {
      includeMention: true,
    });
  }

  public renderGoodbye(config: GuildConfig, member: GreetingMember) {
    return this.renderTemplate(config.goodbyeMessage, member, {
      includeMention: false,
    });
  }

  public async sendWelcome(config: GuildConfig, member: GuildMember) {
    const plan = this.planner.execute("welcome", config, this.variables(member, true));
    return plan ? this.sendGreeting({ guild: member.guild, ...plan, kind: "welcome" }) : false;
  }
  public async sendGoodbye(config: GuildConfig, member: GreetingMember) {
    const plan = this.planner.execute("goodbye", config, this.variables(member, false));
    return plan ? this.sendGreeting({ guild: member.guild, ...plan, kind: "goodbye" }) : false;
  }
  private variables(member: GreetingMember, includeUserMention: boolean) {
    return new Map(greetingTemplateVariables.map((variable) => [variable.key, variable.resolve({ member, includeUserMention })]));
  }
  private renderTemplate(template: string, member: GreetingMember, options: { includeMention: boolean }) {
    return this.planner.render(template, this.variables(member, options.includeMention));
  }

  private async sendGreeting({
    guild,
    channelId,
    content,
    kind,
  }: {
    guild: Guild;
    channelId: string;
    content: string;
    kind: GreetingKind;
  }) {
    const channel = await guild.channels.fetch(channelId).catch((error) => {
      logger.warn({ err: error, guildId: guild.id, channelId, kind }, "Failed to fetch greeting channel");
      return null;
    });

    if (!channel || !this.isSendableGuildTextChannel(channel)) {
      logger.warn({ guildId: guild.id, channelId, kind }, "Greeting channel is unavailable or not text based");
      return false;
    }

    const me = guild.members.me;
    if (me && "permissionsFor" in channel) {
      const permissions = channel.permissionsFor(me);
      if (
        !permissions?.has([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
        ])
      ) {
        logger.warn({ guildId: guild.id, channelId, kind }, "Missing permission to send greeting");
        return false;
      }
    }

    await channel.send({ content }).catch((error: unknown) => {
      logger.warn({ err: error, guildId: guild.id, channelId, kind }, "Failed to send greeting");
      return null;
    });

    return true;
  }

  private isSendableGuildTextChannel(
    channel: unknown,
  ): channel is Extract<
    GuildBasedChannel,
    { type: ChannelType.GuildText | ChannelType.GuildAnnouncement }
  > {
    if (!channel || typeof channel !== "object" || !("type" in channel)) {
      return false;
    }

    return (
      channel?.type === ChannelType.GuildText ||
      channel?.type === ChannelType.GuildAnnouncement
    );
  }
}

export const greetingAdapterToken = serviceToken<Pick<GreetingService, keyof GreetingService>>("welcome.discord");
export const greetingService = serviceRef(greetingAdapterToken);
