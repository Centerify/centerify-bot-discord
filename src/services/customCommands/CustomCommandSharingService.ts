import { PermissionFlagsBits, type Client, type Guild } from "discord.js";
import type { CustomCommandRecord } from "../../lib/customCommands/types.js";
import { CustomCommandValidationError } from "../../lib/customCommands/errors.js";
import type { CustomCommandService } from "./CustomCommandService.js";

export type CommandScope = "server" | "all" | "selected";
export interface CommandSharing {
  guildId: string;
  commandId: number;
  actorId: string;
  scope: Exclude<CommandScope, "server">;
  selectedGuildIds: string;
}
export interface SharingRepository {
  get(guildId: string, commandId: number): Promise<CommandSharing | null>;
  candidates(name: string): Promise<CommandSharing[]>;
  save(
    command: CustomCommandRecord,
    sharing: CommandSharing | null,
  ): Promise<void>;
  hasLegacyName(guildId: string, name: string): Promise<boolean>;
}
export const hasServerRestrictions = (command: CustomCommandRecord) =>
  [
    command.allowedRoleIds,
    command.deniedRoleIds,
    command.allowedChannelIds,
    command.deniedChannelIds,
  ].some((ids) => ids.length > 0);

export class CustomCommandSharingService {
  public constructor(
    private readonly repository: SharingRepository,
    private readonly commands: Pick<
      CustomCommandService,
      "listCommands" | "invalidate" | "isReserved"
    >,
    private readonly isVerified: (guild: Guild) => Promise<boolean>,
  ) {}

  public async canManage(guild: Guild, actorId: string): Promise<boolean> {
    try {
      const current = await guild.fetch();
      const member = await current.members.fetch({
        user: actorId,
        force: true,
      });
      return (
        (current.ownerId === actorId ||
          member.permissions.has(PermissionFlagsBits.Administrator)) &&
        (await this.isVerified(current))
      );
    } catch {
      return false;
    }
  }

  public async discover(client: Client, actorId: string, sourceId: string) {
    const guilds = [...client.guilds.cache.values()].filter(
      (guild) => guild.id !== sourceId,
    );
    const choices: { id: string; name: string }[] = [];
    for (let offset = 0; offset < guilds.length; offset += 5) {
      const batch = await Promise.all(
        guilds
          .slice(offset, offset + 5)
          .map(async (guild) =>
            (await this.canManage(guild, actorId))
              ? { id: guild.id, name: guild.name }
              : null,
          ),
      );
      choices.push(
        ...batch.filter(
          (item): item is { id: string; name: string } => item !== null,
        ),
      );
    }
    return choices.sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
  }

  public get(command: CustomCommandRecord) {
    return this.repository.get(command.guildId, command.id);
  }

  public async save(
    client: Client,
    actorId: string,
    command: CustomCommandRecord,
    scope: CommandScope,
    selected: string[],
  ) {
    if (!["server", "all", "selected"].includes(scope))
      throw new CustomCommandValidationError("Choose a valid command scope.");
    const source = client.guilds.cache.get(command.guildId);
    if (!source || !(await this.canManage(source, actorId)))
      throw new CustomCommandValidationError(
        "Administrator permission and verified ownership are required in the source server.",
      );
    if (scope !== "server" && hasServerRestrictions(command))
      throw new CustomCommandValidationError(
        "Clear server-specific role and channel restrictions in Customize before sharing. Discord permission requirements work across servers.",
      );
    const ids = [...new Set(selected)].filter((id) => id !== command.guildId);
    if (scope === "selected") {
      if (!ids.length || ids.length > 100)
        throw new CustomCommandValidationError("Choose 1–100 other servers.");
      for (const id of ids) {
        const guild = client.guilds.cache.get(id);
        if (!guild || !(await this.canManage(guild, actorId)))
          throw new CustomCommandValidationError(
            "Every selected server must have verified ownership and you must be an administrator there. Refresh the server list.",
          );
      }
    }
    await this.repository.save(
      command,
      scope === "server"
        ? null
        : {
            guildId: command.guildId,
            commandId: command.id,
            actorId,
            scope,
            selectedGuildIds: scope === "selected" ? ids.join(",") : "",
          },
    );
  }

  /** Local names win. Multiple shared matches fail closed instead of picking an arbitrary source. */
  public async resolve(
    client: Client,
    target: Guild,
    name: string,
  ): Promise<CustomCommandRecord | null> {
    name = name.trim().toLowerCase();
    if (
      this.commands.isReserved(name) ||
      (await this.repository.hasLegacyName(target.id, name))
    )
      return null;
    const candidates = await this.repository.candidates(
      name.trim().toLowerCase(),
    );
    if (candidates.length > 100) return null;
    let found: CustomCommandRecord | null = null;
    for (const sharing of candidates) {
      if (
        sharing.guildId === target.id ||
        (sharing.scope !== "all" && sharing.scope !== "selected")
      )
        continue;
      if (
        sharing.scope === "selected" &&
        !sharing.selectedGuildIds.split(",").includes(target.id)
      )
        continue;
      const source = client.guilds.cache.get(sharing.guildId);
      if (
        !source ||
        !(await this.canManage(source, sharing.actorId)) ||
        !(await this.canManage(target, sharing.actorId))
      )
        continue;
      this.commands.invalidate(sharing.guildId);
      // Lookup canonical names and aliases through the source's current namespace.
      const command = (await this.commands.listCommands(sharing.guildId)).find(
        (item) => item.id === sharing.commandId,
      );
      if (
        !command ||
        !command.enabled ||
        hasServerRestrictions(command) ||
        ![command.name, ...command.aliases].includes(name.trim().toLowerCase())
      )
        continue;
      if (found) return null;
      found = { ...command, guildId: target.id, sourceGuildId: source.id };
    }
    return found;
  }
}
