import { serviceToken, type CenterifyModule } from "../../core/index.js";
import { guildConfigToken } from "../guilds/index.js";
import { XpService, type XpRepository } from "./application/XpService.js";
import { ConfigureXp, type XpConfigurationRepository } from "./application/ConfigureXp.js";
export { XpService } from "./application/XpService.js";
export type { XpRepository } from "./application/XpService.js";
export { ConfigureXp, xpConfiguration } from "./application/ConfigureXp.js";
export type { XpConfigurationRepository, XpSettings } from "./application/ConfigureXp.js";
export * from "./domain/policy.js";
export const xpToken = serviceToken<Pick<XpService, keyof XpService>>("xp.service");
export const configureXpToken = serviceToken<Pick<ConfigureXp, keyof ConfigureXp>>("xp.configuration");
export function createXpModule(options: { repository: XpRepository; configuration: XpConfigurationRepository }): CenterifyModule {
  return {
    metadata: { id: "xp", name: "Experience", version: "1.0.0", dependsOn: ["guilds"] },
    register(context) {
      context.provide(xpToken, new XpService(options.repository, context.resolve(guildConfigToken)));
      context.provide(configureXpToken, new ConfigureXp(options.configuration));
    },
  };
}
