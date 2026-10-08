import { db } from "../../../adapters/prisma/client.js";
import { DEFAULT_WELCOME_MESSAGE, DEFAULT_GOODBYE_MESSAGE, type GuildConfigStore, type GuildConfigUpdate } from "../domain/config.js";

export class PrismaGuildConfigRepository implements GuildConfigStore {
  constructor(private readonly database: typeof db = db) {}
  public async getOrCreate(guildId: string) {
    const existing = await this.findByGuildId(guildId);
    if (existing) {
      return existing;
    }

    try {
      return await this.database.orm.public.GuildConfig.create(this.createDefaults(guildId));
    } catch (error) {
      if (this.isGuildIdConflict(error)) {
        return this.findByGuildIdOrThrow(guildId);
      }

      throw error;
    }
  }

  public async update(guildId: string, data: GuildConfigUpdate) {
    try {
      return await this.database.orm.public.GuildConfig.upsert({
        create: {
          ...this.createDefaults(guildId),
          ...data,
        },
        update: data,
        conflictOn: { guildId },
      });
    } catch (error) {
      if (this.isGuildIdConflict(error)) {
        await this.database.orm.public.GuildConfig.where({ guildId }).update(data);
        return this.findByGuildIdOrThrow(guildId);
      }

      throw error;
    }
  }

  public async globalModerationGuildIds(
    feature: "ban" | "warn" | "note",
  ) {
    const configs = feature === "ban"
      ? await this.database.orm.public.GuildConfig
          .where({ globalBanEnabled: true })
          .select("guildId")
          .all()
      : feature === "warn"
        ? await this.database.orm.public.GuildConfig
            .where({ globalWarnEnabled: true })
            .select("guildId")
            .all()
        : await this.database.orm.public.GuildConfig
            .where({ globalNoteEnabled: true })
            .select("guildId")
            .all();

    return configs.map((config) => config.guildId);
  }

  private createDefaults(guildId: string) {
    return {
      guildId,
      welcomeMessage: DEFAULT_WELCOME_MESSAGE,
      goodbyeMessage: DEFAULT_GOODBYE_MESSAGE,
    };
  }

  private findByGuildId(guildId: string) {
    return this.database.orm.public.GuildConfig.where({ guildId }).first();
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
      (error.constraint === "guild_config_guildId_key" ||
        error.constraint === "guildConfig_guildId_key")
    );
  }
}
