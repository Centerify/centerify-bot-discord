import { PermissionFlagsBits, type Client, type Guild } from "discord.js";
import { CommandSharingService, type SharingDirectory, type SharingRepository, type CommandScope } from "../application/CommandSharingService.js";
import type { CustomCommandService } from "../application/CustomCommandService.js";
import type { CustomCommandRecord } from "../domain/types.js";
export * from "../application/CommandSharingService.js";

export class CustomCommandSharingService {
  constructor(
    private readonly repository: SharingRepository,
    private readonly commands: Pick<CustomCommandService, "listCommands" | "invalidate" | "isReserved">,
    private readonly isVerified: (guild: Guild) => Promise<boolean>,
  ) {}
  async canManage(guild: Guild, actorId: string) {
    try {
      const current = await guild.fetch();
      const [member, verified] = await Promise.all([current.members.fetch({ user: actorId, force: true }), this.isVerified(current)]);
      return (current.ownerId === actorId || member.permissions.has(PermissionFlagsBits.Administrator)) && verified;
    } catch { return false; }
  }
  private directory(client: Client): SharingDirectory {
    return { get: (id) => client.guilds.cache.get(id), list: () => [...client.guilds.cache.values()] };
  }
  private service(client: Client) {
    return new CommandSharingService(this.repository, this.commands, async (guild, actor) => {
      const current = client.guilds.cache.get(guild.id);
      return current ? this.canManage(current, actor) : false;
    });
  }
  get(command: CustomCommandRecord) { return this.repository.get(command.sourceGuildId ?? command.guildId, command.id); }
  discover(client: Client, actorId: string, sourceId: string) { return this.service(client).discover(this.directory(client), actorId, sourceId); }
  listAvailable(client: Client, target: Guild) { return this.service(client).listAvailable(this.directory(client), target); }
  forManagement(client: Client, target: Guild, actorId: string, command: CustomCommandRecord) {
    return this.service(client).forManagement(this.directory(client), target, actorId, command);
  }
  save(client: Client, actorId: string, command: CustomCommandRecord, scope: CommandScope, selected: string[], confirmation?: string, resolution: "keep" | "replace" = "keep") {
    return this.service(client).save(this.directory(client), actorId, command, scope, selected, confirmation, resolution);
  }
  resolve(client: Client, target: Guild, name: string) { return this.service(client).resolve(this.directory(client), target, name); }
}
