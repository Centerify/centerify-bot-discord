import type { Client } from "discord.js";
import { serviceRef } from "../../../adapters/discord/context.js";
import { configureXpToken } from "../index.js";
export { xpConfiguration } from "../application/ConfigureXp.js";
import { guildOwnershipService } from "../../guilds/discord/index.js";
import type { GuildConfig } from "../../guilds/discord/index.js";
import { canManageServer } from "../../guilds/discord/index.js";

export class XpConfigurationService {
  public async apply(client: Client, userId: string, source: GuildConfig, targetIds: string[]) {
    const ids = [...new Set([source.guildId, ...targetIds])];
    if (ids.length > 25) throw new Error("Choose at most 25 servers, including this server.");
    // Validate every server before writing, then commit the whole group together.
    for (const id of ids) {
      const guild = client.guilds.cache.get(id);
      if (!guild) throw new Error(`Centerify must be in server ${id}.`);
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member || !canManageServer(member)) throw new Error(`You need Manage Server permission in server ${id}.`);
      if (!await guildOwnershipService.isVerified(guild)) throw new Error(`The owner of server ${id} must run /verify first.`);
    }
    return serviceRef(configureXpToken).apply(source, ids);
  }
}
export const xpConfigurationService = new XpConfigurationService();
