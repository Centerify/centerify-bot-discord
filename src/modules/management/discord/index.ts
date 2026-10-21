import type { DiscordModule } from "../../../adapters/discord/modules.js";
import { ChannelCommand } from "./commands/channel.js";
import { RoleCommand } from "./commands/role.js";
import { ServerConfigCommand } from "./commands/serverconfig.js";

export { ChannelCommand, RoleCommand, ServerConfigCommand };
export const discordModule: DiscordModule = {
  commands: { channel: ChannelCommand, role: RoleCommand, serverconfig: ServerConfigCommand },
};
