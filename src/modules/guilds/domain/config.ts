export const DEFAULT_WELCOME_MESSAGE =
  "Welcome {user} to **{server}**! You are member #{memberCount}.";

export const DEFAULT_GOODBYE_MESSAGE =
  "{displayName} left **{server}**. We now have {memberCount} members.";

export interface GuildConfig {
  id: number;
  guildId: string;
  xpEnabled: boolean;
  xpMethods: string;
  xpMessageAmount: number;
  xpReactionAmount: number;
  xpDailyAmount: number;
  xpCooldownSeconds: number;
  xpSharing: string;
  xpSharedGuildIds: string;
  setupCompleted: boolean;
  welcomeEnabled: boolean;
  welcomeChannelId: string | null;
  welcomeMessage: string;
  goodbyeEnabled: boolean;
  goodbyeChannelId: string | null;
  goodbyeMessage: string;
  autoRoleEnabled: boolean;
  autoRoleId: string | null;
  loggingEnabled: boolean;
  loggingChannelId: string | null;
  globalBanEnabled: boolean;
  globalWarnEnabled: boolean;
  globalNoteEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type GuildConfigUpdate = Partial<{
  xpEnabled: boolean;
  xpMethods: string;
  xpMessageAmount: number;
  xpReactionAmount: number;
  xpDailyAmount: number;
  xpCooldownSeconds: number;
  xpSharing: string;
  xpSharedGuildIds: string;
  setupCompleted: boolean;
  welcomeEnabled: boolean;
  welcomeChannelId: string | null;
  welcomeMessage: string;
  goodbyeEnabled: boolean;
  goodbyeChannelId: string | null;
  goodbyeMessage: string;
  autoRoleEnabled: boolean;
  autoRoleId: string | null;
  loggingEnabled: boolean;
  loggingChannelId: string | null;
  globalBanEnabled: boolean;
  globalWarnEnabled: boolean;
  globalNoteEnabled: boolean;
}>;

export interface GuildConfigStore {
  getOrCreate(guildId: string): Promise<GuildConfig>;
  update(guildId: string, data: GuildConfigUpdate): Promise<GuildConfig>;
  globalModerationGuildIds(feature: "ban" | "warn" | "note"): Promise<string[]>;
}
