import { serviceRef } from "../../../adapters/discord/context.js";
import { guildConfigToken } from "../index.js";
export { DEFAULT_WELCOME_MESSAGE, DEFAULT_GOODBYE_MESSAGE } from "../index.js";
export type { GuildConfig, GuildConfigUpdate } from "../index.js";
export const guildConfigService = serviceRef(guildConfigToken);
