import { db } from "../prisma/db.js";

export const DEFAULT_WELCOME_MESSAGE =
  "Welcome {user} to **{server}**! You are member #{memberCount}.";

export const DEFAULT_GOODBYE_MESSAGE =
  "{displayName} left **{server}**. We now have {memberCount} members.";

export type GuildConfig = Awaited<
  ReturnType<typeof GuildConfigService.prototype.getOrCreate>
>;

export type GuildConfigUpdate = Partial<{
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
}>;

export class GuildConfigService {
  public async getOrCreate(guildId: string) {
    const existing = await this.findByGuildId(guildId);
    if (existing) {
      return existing;
    }

    try {
      return await db.orm.public.GuildConfig.create(this.createDefaults(guildId));
    } catch (error) {
      if (this.isGuildIdConflict(error)) {
        return this.findByGuildIdOrThrow(guildId);
      }

      throw error;
    }
  }

  public async update(guildId: string, data: GuildConfigUpdate) {
    try {
      return await db.orm.public.GuildConfig.upsert({
        create: {
          ...this.createDefaults(guildId),
          ...data,
        },
        update: data,
      });
    } catch (error) {
      if (this.isGuildIdConflict(error)) {
        await db.orm.public.GuildConfig.where({ guildId }).update(data);
        return this.findByGuildIdOrThrow(guildId);
      }

      throw error;
    }
  }

  private createDefaults(guildId: string) {
    return {
      guildId,
      welcomeMessage: DEFAULT_WELCOME_MESSAGE,
      goodbyeMessage: DEFAULT_GOODBYE_MESSAGE,
    };
  }

  private findByGuildId(guildId: string) {
    return db.orm.public.GuildConfig.where({ guildId }).first();
  }

  private async findByGuildIdOrThrow(guildId: string) {
    const config = await this.findByGuildId(guildId);
    if (!config) {
      throw new Error(`Guild config for ${guildId} was not found after unique conflict`);
    }

    return config;
  }

  private isGuildIdConflict(error: unknown) {
    if (!error || typeof error !== "object") {
      return false;
    }

    return (
      "sqlState" in error &&
      "constraint" in error &&
      error.sqlState === "23505" &&
      error.constraint === "guildConfig_guildId_key"
    );
  }
}

export const guildConfigService = new GuildConfigService();
