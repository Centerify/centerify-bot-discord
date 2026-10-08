import { discordEvent, type DiscordModule } from "../../../adapters/discord/modules.js";
import { XpCommand } from "./commands/xp.js";
export { XpCommand } from "./commands/xp.js";
export * from "./services.js";
export * from "./configuration.js";
import { onXpMessage, onXpReaction } from "./events.js";

export const discordModule: DiscordModule = {
  commands: { "xp": XpCommand },
  events: [discordEvent("messageCreate", onXpMessage), discordEvent("messageReactionAdd", onXpReaction)],
};
