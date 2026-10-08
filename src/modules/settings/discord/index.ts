import { discordEvent, type DiscordModule } from "../../../adapters/discord/modules.js";
import { SettingsCommand } from "./commands/settings.js";
import { SetupCommand } from "./commands/setup.js";
export { SettingsCommand } from "./commands/settings.js";
export { SetupCommand } from "./commands/setup.js";

export const discordModule: DiscordModule = {
  commands: { "settings": SettingsCommand, "setup": SetupCommand },
};
