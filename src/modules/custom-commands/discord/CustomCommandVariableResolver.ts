import type {
  CustomCommandExecutionContext,
  VariableResolver,
} from "../discord/types.js";
import {
  CUSTOM_COMMAND_PREFIX,
  CUSTOM_COMMAND_LIMITS as L,
} from "../domain/constants.js";
import { CustomCommandValidationError } from "../domain/errors.js";

// Only these complete placeholders may be used as embed URLs.
export { URL_VARIABLES } from "../domain/variables.js";
import { templateTokens, customVariables } from "../domain/variables.js";
const iso = (date: Date | null | undefined) => date?.toISOString() ?? "";

export function parseArguments(input: string): string[] {
  if (input.length > L.argumentInput)
    throw new CustomCommandValidationError(
      `Arguments must be at most ${L.argumentInput} characters.`,
    );
  const args = input.trim() ? input.trim().split(/\s+/u) : [];
  if (args.length > L.arguments)
    throw new CustomCommandValidationError(
      `Use at most ${L.arguments} arguments.`,
    );
  return args;
}

export class CustomCommandVariableResolver {
  private readonly resolvers = new Map<string, VariableResolver>();
  public constructor() {
    const values: Record<string, (c: CustomCommandExecutionContext) => string> =
      {
        "user.id": (c) => c.userId,
        "user.name": (c) => c.member.user.username,
        "user.displayName": (c) => c.member.displayName,
        "user.mention": (c) => `<@${c.userId}>`,
        "user.avatar": (c) => c.member.user.displayAvatarURL(),
        "user.defaultAvatar": (c) => c.member.user.defaultAvatarURL,
        "user.globalName": (c) =>
          c.member.user.globalName ?? c.member.user.username,
        "user.createdAt": (c) => iso(c.member.user.createdAt),
        "user.bot": (c) => String(c.member.user.bot),
        "member.avatar": (c) => c.member.displayAvatarURL(),
        "member.nickname": (c) => c.member.nickname ?? c.member.displayName,
        "member.joinedAt": (c) => iso(c.member.joinedAt),
        "member.boostingSince": (c) => iso(c.member.premiumSince),
        "member.color": (c) => c.member.displayHexColor,
        "member.topRole": (c) => c.member.roles.highest.name,
        "member.roleCount": (c) =>
          String(
            [...c.member.roles.cache.keys()].filter((id) => id !== c.guildId)
              .length,
          ),
        "guild.icon": (c) => c.guild.iconURL() ?? "",
        "guild.banner": (c) => c.guild.bannerURL() ?? "",
        "guild.ownerId": (c) => c.guild.ownerId,
        "guild.createdAt": (c) => iso(c.guild.createdAt),
        "guild.description": (c) => c.guild.description ?? "",
        "guild.boostCount": (c) =>
          String(c.guild.premiumSubscriptionCount ?? 0),
        "guild.boostTier": (c) => String(c.guild.premiumTier),
        "guild.locale": (c) => c.guild.preferredLocale,
        "guild.id": (c) => c.guildId,
        "guild.name": (c) => c.guild.name,
        "guild.memberCount": (c) => String(c.guild.memberCount),
        "channel.id": (c) => c.channelId,
        "channel.name": (c) => c.channel.name,
        "channel.mention": (c) => `<#${c.channelId}>`,
        "channel.topic": (c) =>
          "topic" in c.channel ? (c.channel.topic ?? "") : "",
        "channel.createdAt": (c) => iso(c.channel.createdAt),
        "channel.type": (c) => String(c.channel.type),
        "channel.nsfw": (c) => String("nsfw" in c.channel && c.channel.nsfw),
        "channel.parentId": (c) => c.channel.parentId ?? "",
        "bot.id": (c) => c.guild.client.user.id,
        "bot.name": (c) => c.guild.client.user.username,
        "bot.mention": (c) => `<@${c.guild.client.user.id}>`,
        "bot.avatar": (c) => c.guild.client.user.displayAvatarURL(),
        "command.description": (c) => c.command.description,
        "command.usageCount": (c) => String(c.command.usageCount),
        "command.cooldown": (c) => String(c.command.cooldownSeconds),
        "command.prefix": () => CUSTOM_COMMAND_PREFIX,
        "command.source": (c) => c.source,
        "args.count": (c) => String(c.args.length),
        "args.first": (c) => c.args[0] ?? "",
        "args.last": (c) => c.args.at(-1) ?? "",
        timestamp: () => String(Math.floor(Date.now() / 1000)),
        datetime: () => new Date().toISOString(),
        "command.name": (c) => c.command.name,
        date: () => new Date().toISOString().slice(0, 10),
        time: () => new Date().toISOString().slice(11, 19),
        args: (c) => c.args.join(" "),
      };
    for (const [key, resolve] of Object.entries(values))
      this.register({ key, resolve });
  }
  public keys(): string[] {
    return [
      ...this.resolvers.keys(),
      ...Array.from({ length: L.arguments }, (_, i) => `args.${i}`),
    ];
  }
  public register(resolver: VariableResolver): void {
    if (
      !/^[a-zA-Z][a-zA-Z0-9.]*$/.test(resolver.key) ||
      this.resolvers.has(resolver.key)
    )
      throw new Error("Invalid or duplicate variable resolver.");
    this.resolvers.set(resolver.key, resolver);
  }
  private tokens(template: string) {
    return templateTokens(template, new Set(this.resolvers.keys()));
  }
  public validate(template: string): void {
    this.tokens(template);
  }
  public async render(
    template: string,
    context: CustomCommandExecutionContext,
  ): Promise<string> {
    const variables = customVariables(context.command.content);
    const keys = new Set([...this.resolvers.keys(), ...Object.keys(variables)]);
    const cache = new Map<string, string>();
    const expand = async (source: string): Promise<string> => {
      let result = "";
      let position = 0;
      for (const token of templateTokens(source, keys)) {
        result += source.slice(position, token.start);
        if (Object.hasOwn(variables, token.key)) {
          if (!cache.has(token.key))
            cache.set(token.key, await expand(variables[token.key]));
          result += cache.get(token.key)!;
        } else
          result += /^args\.\d+$/.test(token.key)
            ? (context.args[Number(token.key.slice(5))] ?? "")
            : await this.resolvers.get(token.key)!.resolve(context);
        if (result.length > L.templateInput)
          throw new CustomCommandValidationError(
            "Rendered output is too long.",
          );
        position = token.end;
      }
      result += source.slice(position);
      if (result.length > L.templateInput)
        throw new CustomCommandValidationError("Rendered output is too long.");
      return result;
    };
    return expand(template);
  }
}
