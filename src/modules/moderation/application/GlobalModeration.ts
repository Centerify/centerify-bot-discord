import { silentLogger, type Logger } from "../../../core/index.js";
import type { GuildConfigStore } from "../../guilds/index.js";
import type { WarningCase } from "./WarnMember.js";

export type GlobalAction = "ban" | "warn" | "note";
export interface ModerationDirectory {
  isVerified(guildId: string): Promise<boolean>;
}

/** Participation and partial-failure policy are shared by every transport. */
export class GlobalModeration {
  constructor(private readonly config: GuildConfigStore, private readonly logger: Logger = silentLogger) {}

  async targets(sourceGuildId: string, feature: GlobalAction, directory: ModerationDirectory) {
    if (!await directory.isVerified(sourceGuildId)) return { enabled: false, guildIds: [] };
    const config = await this.config.getOrCreate(sourceGuildId);
    const enabled = { ban: config.globalBanEnabled, warn: config.globalWarnEnabled, note: config.globalNoteEnabled }[feature];
    if (!enabled) return { enabled: false, guildIds: [] };
    const guildIds: string[] = [];
    for (const id of await this.config.globalModerationGuildIds(feature)) {
      if (await directory.isVerified(id)) guildIds.push(id);
    }
    return { enabled: true, guildIds };
  }

  async apply(input: { guildIds: readonly string[]; targetUserId: string; action: GlobalAction }, perform: (guildId: string) => Promise<WarningCase | null>) {
    const cases: WarningCase[] = [];
    const skippedGuildIds: string[] = [];
    for (const guildId of input.guildIds) {
      try {
        const result = await perform(guildId);
        if (result) cases.push(result);
        else skippedGuildIds.push(guildId);
      } catch (error) {
        skippedGuildIds.push(guildId);
        const action = input.action === "warn" ? "warning" : input.action;
        this.logger.warn({ err: error, guildId, userId: input.targetUserId }, `Global ${action} failed in a participating guild`);
      }
    }
    return { cases, skippedGuildIds };
  }
}
