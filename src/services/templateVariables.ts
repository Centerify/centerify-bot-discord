import type { GuildMember, PartialGuildMember } from "discord.js";

export type GreetingTemplateContext = {
  member: GuildMember | PartialGuildMember;
  includeUserMention: boolean;
};

type TemplateVariableCategory =
  | "User"
  | "Server"
  | "Counts"
  | "Dates"
  | "Roles"
  | "Images";

export type TemplateVariable = {
  key: string;
  category: TemplateVariableCategory;
  welcomeOnly?: boolean;
  resolve: (context: GreetingTemplateContext) => string;
};

const unknown = "Unknown";

export const greetingTemplateVariables: readonly TemplateVariable[] = [
  {
    key: "user",
    category: "User",
    welcomeOnly: true,
    resolve: ({ member, includeUserMention }) =>
      includeUserMention ? `${member.user}` : member.user.username,
  },
  {
    key: "mention",
    category: "User",
    resolve: ({ member }) => `${member.user}`,
  },
  {
    key: "username",
    category: "User",
    resolve: ({ member }) => member.user.username,
  },
  {
    key: "globalName",
    category: "User",
    resolve: ({ member }) => member.user.globalName ?? unknown,
  },
  {
    key: "displayName",
    category: "User",
    resolve: ({ member }) => member.displayName,
  },
  {
    key: "nickname",
    category: "User",
    resolve: ({ member }) => member.nickname ?? unknown,
  },
  {
    key: "tag",
    category: "User",
    resolve: ({ member }) => member.user.tag,
  },
  {
    key: "userId",
    category: "User",
    resolve: ({ member }) => member.user.id,
  },
  {
    key: "bot",
    category: "User",
    resolve: ({ member }) => yesNo(member.user.bot),
  },
  {
    key: "avatar",
    category: "User",
    resolve: ({ member }) => member.user.displayAvatarURL({ size: 256 }),
  },
  {
    key: "server",
    category: "Server",
    resolve: ({ member }) => member.guild.name,
  },
  {
    key: "serverDescription",
    category: "Server",
    resolve: ({ member }) => member.guild.description ?? unknown,
  },
  {
    key: "serverId",
    category: "Server",
    resolve: ({ member }) => member.guild.id,
  },
  {
    key: "ownerId",
    category: "Server",
    resolve: ({ member }) => member.guild.ownerId,
  },
  {
    key: "preferredLocale",
    category: "Server",
    resolve: ({ member }) => member.guild.preferredLocale,
  },
  {
    key: "verificationLevel",
    category: "Server",
    resolve: ({ member }) => String(member.guild.verificationLevel),
  },
  {
    key: "boostTier",
    category: "Server",
    resolve: ({ member }) => String(member.guild.premiumTier),
  },
  {
    key: "boostCount",
    category: "Server",
    resolve: ({ member }) => formatNumber(member.guild.premiumSubscriptionCount ?? 0),
  },
  {
    key: "vanityUrl",
    category: "Server",
    resolve: ({ member }) =>
      member.guild.vanityURLCode ? `https://discord.gg/${member.guild.vanityURLCode}` : unknown,
  },
  {
    key: "memberCount",
    category: "Counts",
    resolve: ({ member }) => formatNumber(member.guild.memberCount),
  },
  {
    key: "roleCount",
    category: "Counts",
    resolve: ({ member }) => formatNumber(member.guild.roles.cache.size),
  },
  {
    key: "channelCount",
    category: "Counts",
    resolve: ({ member }) => formatNumber(member.guild.channels.cache.size),
  },
  {
    key: "emojiCount",
    category: "Counts",
    resolve: ({ member }) => formatNumber(member.guild.emojis.cache.size),
  },
  {
    key: "stickerCount",
    category: "Counts",
    resolve: ({ member }) => formatNumber(member.guild.stickers.cache.size),
  },
  {
    key: "role",
    category: "Roles",
    resolve: ({ member }) => highestRoleName(member),
  },
  {
    key: "roleMention",
    category: "Roles",
    resolve: ({ member }) => highestRoleMention(member),
  },
  {
    key: "roleCountUser",
    category: "Roles",
    resolve: ({ member }) => formatNumber(memberRoleCount(member)),
  },
  {
    key: "roles",
    category: "Roles",
    resolve: ({ member }) => memberRoleNames(member),
  },
  {
    key: "joinedAt",
    category: "Dates",
    resolve: ({ member }) => discordTimestamp(member.joinedTimestamp),
  },
  {
    key: "joinedShort",
    category: "Dates",
    resolve: ({ member }) => discordTimestamp(member.joinedTimestamp, "d"),
  },
  {
    key: "joinedRelative",
    category: "Dates",
    resolve: ({ member }) => discordTimestamp(member.joinedTimestamp, "R"),
  },
  {
    key: "accountCreatedAt",
    category: "Dates",
    resolve: ({ member }) => discordTimestamp(member.user.createdTimestamp),
  },
  {
    key: "accountCreatedShort",
    category: "Dates",
    resolve: ({ member }) => discordTimestamp(member.user.createdTimestamp, "d"),
  },
  {
    key: "accountCreatedRelative",
    category: "Dates",
    resolve: ({ member }) => discordTimestamp(member.user.createdTimestamp, "R"),
  },
  {
    key: "serverCreatedAt",
    category: "Dates",
    resolve: ({ member }) => discordTimestamp(member.guild.createdTimestamp),
  },
  {
    key: "serverCreatedShort",
    category: "Dates",
    resolve: ({ member }) => discordTimestamp(member.guild.createdTimestamp, "d"),
  },
  {
    key: "serverCreatedRelative",
    category: "Dates",
    resolve: ({ member }) => discordTimestamp(member.guild.createdTimestamp, "R"),
  },
  {
    key: "boostingSince",
    category: "Dates",
    resolve: ({ member }) => discordTimestamp(member.premiumSinceTimestamp),
  },
  {
    key: "boostingSinceRelative",
    category: "Dates",
    resolve: ({ member }) => discordTimestamp(member.premiumSinceTimestamp, "R"),
  },
  {
    key: "now",
    category: "Dates",
    resolve: () => discordTimestamp(Date.now()),
  },
  {
    key: "nowRelative",
    category: "Dates",
    resolve: () => discordTimestamp(Date.now(), "R"),
  },
  {
    key: "avatarUrl",
    category: "Images",
    resolve: ({ member }) => member.user.displayAvatarURL({ size: 256 }),
  },
  {
    key: "serverIconUrl",
    category: "Images",
    resolve: ({ member }) => member.guild.iconURL({ size: 256 }) ?? unknown,
  },
  {
    key: "serverBannerUrl",
    category: "Images",
    resolve: ({ member }) => member.guild.bannerURL({ size: 512 }) ?? unknown,
  },
] as const;

export function renderGreetingTemplate(
  template: string,
  context: GreetingTemplateContext,
) {
  const replacements = new Map(
    greetingTemplateVariables.map((variable) => [
      variable.key,
      variable.resolve(context),
    ]),
  );

  return template.replaceAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (match, key: string) => {
    return replacements.get(key) ?? match;
  });
}

export function formatGreetingVariableList(options: { includeWelcomeOnly: boolean }) {
  const lines = greetingTemplateVariables
    .filter((variable) => options.includeWelcomeOnly || !variable.welcomeOnly)
    .reduce((lines, variable) => {
      const label = `**${variable.category}:**`;
      const currentLine = lines.get(label) ?? [];
      currentLine.push(`\`{${variable.key}}\``);
      lines.set(label, currentLine);
      return lines;
    }, new Map<string, string[]>());

  return Array.from(lines.entries())
    .map(([label, variables]) => `${label} ${variables.join(" ")}`)
    .join("\n");
}

function discordTimestamp(timestamp: number | null, style = "F") {
  if (!timestamp) {
    return unknown;
  }

  return `<t:${Math.floor(timestamp / 1_000)}:${style}>`;
}

function formatNumber(value: number) {
  return value.toLocaleString();
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

function memberRoleCount(member: GuildMember | PartialGuildMember) {
  if (!("roles" in member)) {
    return 0;
  }

  return member.roles.cache.filter((role) => role.id !== member.guild.id).size;
}

function highestRoleName(member: GuildMember | PartialGuildMember) {
  if (!("roles" in member)) {
    return unknown;
  }

  const role = member.roles.highest;
  return role.id === member.guild.id ? unknown : role.name;
}

function highestRoleMention(member: GuildMember | PartialGuildMember) {
  if (!("roles" in member)) {
    return unknown;
  }

  const role = member.roles.highest;
  return role.id === member.guild.id ? unknown : `${role}`;
}

function memberRoleNames(member: GuildMember | PartialGuildMember) {
  if (!("roles" in member)) {
    return unknown;
  }

  const roles = member.roles.cache
    .filter((role) => role.id !== member.guild.id)
    .map((role) => role.name);

  return roles.length > 0 ? roles.join(", ") : unknown;
}
