import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
  type PartialGuildMember,
} from "discord.js";
import { logger } from "../logger.js";
import type { GuildConfig } from "./guildConfigService.js";
import { renderGreetingTemplate } from "./templateVariables.js";

type GreetingKind = "welcome" | "goodbye";

type GreetingMember = GuildMember | PartialGuildMember;

export class GreetingService {
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
    if (!config.welcomeEnabled || !config.welcomeChannelId) {
      return false;
    }

    return this.sendGreeting({
      guild: member.guild,
      channelId: config.welcomeChannelId,
      content: this.renderWelcome(config, member),
      kind: "welcome",
    });
  }

  public async sendGoodbye(config: GuildConfig, member: GreetingMember) {
    if (!config.goodbyeEnabled || !config.goodbyeChannelId) {
      return false;
    }

    return this.sendGreeting({
      guild: member.guild,
      channelId: config.goodbyeChannelId,
      content: this.renderGoodbye(config, member),
      kind: "goodbye",
    });
  }

  private renderTemplate(
    template: string,
    member: GreetingMember,
    options: { includeMention: boolean },
  ) {
    return renderGreetingTemplate(template, {
      member,
      includeUserMention: options.includeMention,
    });
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

export const greetingService = new GreetingService();
