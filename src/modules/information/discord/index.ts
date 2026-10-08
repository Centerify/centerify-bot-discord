import { discordEvent, type DiscordModule } from "../../../adapters/discord/modules.js";
import { HelpCommand } from "./commands/help.js";
import { InfoCommand } from "./commands/info.js";
import { PingCommand } from "./commands/ping.js";
import { ServerCommand } from "./commands/server.js";
import { StatusCommand } from "./commands/status.js";
export { HelpCommand } from "./commands/help.js";
export { InfoCommand } from "./commands/info.js";
export { PingCommand } from "./commands/ping.js";
export { ServerCommand } from "./commands/server.js";
export { StatusCommand } from "./commands/status.js";

export const discordModule: DiscordModule = {
  commands: { "help": HelpCommand, "info": InfoCommand, "ping": PingCommand, "server": ServerCommand, "status": StatusCommand },
};
