import { serviceToken, type CenterifyModule } from "../../core/index.js";
import type { GuildConfigStore } from "./domain/config.js";
import { VerifyGuildOwnership, type OwnershipRepository } from "./application/VerifyGuildOwnership.js";
export * from "./domain/config.js";
export { VerifyGuildOwnership } from "./application/VerifyGuildOwnership.js";
export type { OwnershipRepository } from "./application/VerifyGuildOwnership.js";
export const guildConfigToken = serviceToken<GuildConfigStore>("guilds.config");
export const guildOwnershipToken = serviceToken<Pick<VerifyGuildOwnership, keyof VerifyGuildOwnership>>("guilds.ownership");

export function createGuildsModule(options: { config: GuildConfigStore; ownership: OwnershipRepository }): CenterifyModule {
  return {
    metadata: { id: "guilds", name: "Guild authorization and configuration", version: "1.0.0" },
    register(context) {
      context.provide(guildConfigToken, options.config);
      context.provide(guildOwnershipToken, new VerifyGuildOwnership(options.ownership));
    },
  };
}
