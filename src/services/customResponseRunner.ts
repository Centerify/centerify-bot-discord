import {
  EmbedBuilder,
  PermissionFlagsBits,
  type GuildMember,
  type Message,
  type PartialGuildMember,
} from "discord.js";
import { isBuiltInCommand } from "./customCommands/reservedNames.js";
import { logger } from "../logger.js";
import { customResponseService, type CustomResponse, type CustomResponseKind } from "./customResponseService.js";
import { guildOwnershipService } from "./guildOwnershipService.js";

const cooldowns = new Map<string, number>();

function render(template: string, member: GuildMember | PartialGuildMember, channel: string, args = "") {
  const values: Record<string, string> = {
    user: `<@${member.id}>`,
    username: member.user.username,
    server: member.guild.name,
    channel,
    args,
    memberCount: String(member.guild.memberCount),
  };
  return template.replace(/\{(user|username|server|channel|args|memberCount)\}/g, (_, key: string) => values[key] ?? "");
}

function payload(rule: CustomResponse, content: string, userId: string) {
  const allowedMentions = { parse: [] as [], users: [userId] };
  const limit = rule.embed ? 4096 : 2000;
  // Arguments and server names can expand a valid stored template beyond Discord's limit.
  const rendered = content.length > limit ? `${content.slice(0, limit - 1)}…` : content;
  if (rule.embed) return { embeds: [new EmbedBuilder().setDescription(rendered).setColor(0x5865f2)], allowedMentions };
  return { content: rendered, allowedMentions };
}

function canSend(channel: unknown, member: GuildMember | null, embed: boolean) {
  if (
    !member ||
    !channel ||
    typeof channel !== "object" ||
    !("permissionsFor" in channel) ||
    typeof channel.permissionsFor !== "function"
  ) return true;
  const inThread = "isThread" in channel && typeof channel.isThread === "function" && channel.isThread();
  const required = [
    PermissionFlagsBits.ViewChannel,
    inThread ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages,
  ];
  if (embed) required.push(PermissionFlagsBits.EmbedLinks);
  const permissions = channel.permissionsFor(member) as { has: (permissions: bigint[]) => boolean } | null;
  return permissions?.has(required) ?? false;
}

export async function runCustomCommand(message: Message) {
  if (!message.guild || !message.member || !message.content.startsWith("!")) return;
  const match = /^!([a-z0-9_-]{1,32})(?:\s+([\s\S]*))?$/i.exec(message.content);
  if (!match) return;
  const trigger = match[1]!.toLowerCase();
  if (isBuiltInCommand(trigger)) return;
  const args = match[2]?.trim() ?? "";
  const rules = await customResponseService.listCached(message.guild.id);
  const rule = rules.find((entry) => entry.enabled && entry.kind === "command" && entry.trigger === trigger);
  if (!rule || (rule.exactMatch && args)) return;
  if (rule.adminOnly && message.author.id !== message.guild.ownerId && !message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
  if (rule.allowedRoleId && !message.member.roles.cache.has(rule.allowedRoleId)) return;
  const key = `${message.guild.id}:${rule.id}:${message.author.id}`;
  const now = Date.now();
  if ((cooldowns.get(key) ?? 0) > now) return;
  const reservedUntil = now + rule.cooldownSeconds * 1000;
  const releaseCooldown = () => {
    // A slow failed send must not remove a newer reservation after this one expires.
    if (rule.cooldownSeconds && cooldowns.get(key) === reservedUntil) cooldowns.delete(key);
  };
  if (rule.cooldownSeconds) {
    if (cooldowns.size > 10_000) {
      for (const [savedKey, until] of cooldowns) if (until <= now) cooldowns.delete(savedKey);
    }
    cooldowns.set(key, reservedUntil);
  }
  try {
    const channel = rule.channelId ? await message.guild.channels.fetch(rule.channelId).catch(() => null) : message.channel;
    if (!channel?.isTextBased() || !("send" in channel) || !canSend(channel, message.guild.members.me, rule.embed)) {
      releaseCooldown();
      return;
    }
    await channel.send(payload(rule, render(rule.response, message.member, `<#${channel.id}>`, args), message.member.id));
  } catch (error) {
    releaseCooldown();
    throw error;
  }
}

export async function runCustomEvent(kind: Extract<CustomResponseKind, "member_join" | "member_leave">, member: GuildMember | PartialGuildMember) {
  if (!await guildOwnershipService.isVerified(member.guild)) return;
  try {
    const rules = await customResponseService.list(member.guild.id);
    for (const rule of rules) {
      if (!rule.enabled || rule.kind !== kind || !rule.channelId) continue;
      const channel = await member.guild.channels.fetch(rule.channelId).catch(() => null);
      if (!channel?.isTextBased() || !('send' in channel)) continue;
      if (!canSend(channel, member.guild.members.me, rule.embed)) continue;
      await channel.send(payload(rule, render(rule.response, member, `<#${channel.id}>`), member.id)).catch((error: unknown) => {
        logger.warn({ err: error, guildId: member.guild.id, kind, ruleId: rule.id }, "Failed to send custom event");
      });
    }
  } catch (error) {
    logger.error({ err: error, guildId: member.guild.id, kind }, "Failed to run custom event");
  }
}
