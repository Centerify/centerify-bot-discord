import { createHash } from "node:crypto";
import { PermissionFlagsBits, type Client, type Guild } from "discord.js";
import type { CustomCommandRecord } from "../../lib/customCommands/types.js";
import { CustomCommandValidationError } from "../../lib/customCommands/errors.js";
import type { CustomCommandService } from "./CustomCommandService.js";

export type CommandScope = "server" | "all" | "selected";
export interface SharingConflict {
  guildId: string;
  guildName: string;
  names: string[];
}
export class CustomCommandSharingConflictError extends CustomCommandValidationError {
  public constructor(
    public readonly conflicts: SharingConflict[],
    public readonly fingerprint: string,
  ) {
    super(
      "Duplicate command names or aliases found. Review the warning before proceeding.",
    );
  }
}
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

  private async conflicts(
    client: Client,
    command: CustomCommandRecord,
    targets: { id: string; name: string }[],
  ): Promise<SharingConflict[]> {
    if (!targets.length) return [];
    const names = [...new Set([command.name, ...command.aliases])].sort();
    const candidates = new Map<string, CommandSharing[]>();
    for (const name of names) {
      const matches = await this.repository.candidates(name);
      if (matches.length > 100)
        throw new CustomCommandValidationError(
          "Too many shared commands use this name. Rename the command or alias before sharing.",
        );
      candidates.set(name, matches);
    }
    const records = new Map<string, CustomCommandRecord[]>();
    const load = async (id: string) => {
      if (!records.has(id)) {
        this.commands.invalidate(id);
        records.set(id, await this.commands.listCommands(id));
      }
      return records.get(id)!;
    };
    const access = new Map<string, boolean>();
    const canManage = async (guild: Guild, actor: string) => {
      const key = `${guild.id}:${actor}`;
      if (!access.has(key)) access.set(key, await this.canManage(guild, actor));
      return access.get(key)!;
    };
    const conflicts: SharingConflict[] = [];
    for (const target of targets) {
      const guild = client.guilds.cache.get(target.id);
      if (!guild)
        throw new CustomCommandValidationError(
          "Refresh the server list before saving.",
        );
      const localNames = new Set(
        (await load(target.id)).flatMap((row) => [row.name, ...row.aliases]),
      );
      const duplicateNames: string[] = [];
      for (const name of names) {
        let duplicate =
          localNames.has(name) ||
          (await this.repository.hasLegacyName(target.id, name));
        if (!duplicate) {
          for (const sharing of candidates.get(name)!) {
            if (
              (sharing.guildId === command.guildId &&
                sharing.commandId === command.id) ||
              sharing.guildId === target.id ||
              (sharing.scope !== "all" && sharing.scope !== "selected") ||
              (sharing.scope === "selected" &&
                !sharing.selectedGuildIds.split(",").includes(target.id))
            )
              continue;
            const source = client.guilds.cache.get(sharing.guildId);
            if (
              !source ||
              !(await canManage(source, sharing.actorId)) ||
              !(await canManage(guild, sharing.actorId))
            )
              continue;
            const shared = (await load(source.id)).find(
              (row) => row.id === sharing.commandId,
            );
            if (
              shared?.enabled &&
              !hasServerRestrictions(shared) &&
              [shared.name, ...shared.aliases].includes(name)
            ) {
              duplicate = true;
              break;
            }
          }
        }
        if (duplicate) duplicateNames.push(name);
      }
      if (duplicateNames.length)
        conflicts.push({
          guildId: target.id,
          guildName: target.name,
          names: duplicateNames,
        });
    }
    return conflicts.sort((a, b) => a.guildId.localeCompare(b.guildId));
  }

  public async save(
    client: Client,
    actorId: string,
    command: CustomCommandRecord,
    scope: CommandScope,
    selected: string[],
    confirmation?: string,
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
    if (scope !== "server") {
      const targets =
        scope === "selected"
          ? ids.map((id) => ({ id, name: client.guilds.cache.get(id)!.name }))
          : await this.discover(client, actorId, command.guildId);
      const conflicts = await this.conflicts(client, command, targets);
      if (conflicts.length) {
        // Bind consent to this definition, scope, selection and observed conflicts.
        // Names can change after this check; resolution still fails closed on ambiguity.
        const fingerprint = createHash("sha256")
          .update(
            JSON.stringify({
              command: [command.guildId, command.id, command.updatedAt],
              scope,
              selected: scope === "selected" ? [...ids].sort() : [],
              conflicts: conflicts.map(({ guildId, names }) => ({
                guildId,
                names,
              })),
            }),
          )
          .digest("hex");
        if (confirmation !== fingerprint)
          throw new CustomCommandSharingConflictError(conflicts, fingerprint);
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
