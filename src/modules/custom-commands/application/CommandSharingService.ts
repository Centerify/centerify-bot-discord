import { createHash } from "node:crypto";
import { responseRoleIds } from "../domain/components.js";
export interface SharingGuild { id: string; name: string }
export interface SharingDirectory {
  get(id: string): SharingGuild | undefined;
  list(): SharingGuild[];
}
import type { CustomCommandRecord } from "../domain/types.js";
import { CustomCommandValidationError } from "../domain/errors.js";
import type { CustomCommandService } from "../application/CustomCommandService.js";

export type CommandScope = "server" | "all" | "selected";
export interface SharingConflict {
  guildId: string;
  guildName: string;
  names: string[];
  replacements?: { id: number; updatedAt: string }[];
  replaceable?: boolean;
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
  available(guildId: string): Promise<CommandSharing[]>;
  get(guildId: string, commandId: number): Promise<CommandSharing | null>;
  candidates(name: string): Promise<CommandSharing[]>;
  save(
    command: CustomCommandRecord,
    sharing: CommandSharing | null,
    replacements?: SharingConflict[],
  ): Promise<void>;
  hasLegacyName(guildId: string, name: string): Promise<boolean>;
}
export const hasServerRestrictions = (command: CustomCommandRecord) =>
  [
    command.allowedRoleIds,
    command.deniedRoleIds,
    command.allowedChannelIds,
    command.deniedChannelIds,
  ].some((ids) => ids.length > 0) || responseRoleIds(command.content).length > 0;

export class CommandSharingService {
  public constructor(
    private readonly repository: SharingRepository,
    private readonly commands: Pick<
      CustomCommandService,
      "listCommands" | "invalidate" | "isReserved"
    >,
    private readonly authorize: (guild: SharingGuild, actorId: string) => Promise<boolean>,
  ) {}

  public async canManage(guild: SharingGuild, actorId: string): Promise<boolean> {
    try { return await this.authorize(guild, actorId); } catch { return false; }
  }

  public async discover(client: SharingDirectory, actorId: string, sourceId: string) {
    const guilds = client.list().filter(
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
    return this.repository.get(command.sourceGuildId ?? command.guildId, command.id);
  }

  private includes(sharing: CommandSharing, targetId: string): boolean {
    return sharing.scope === "all" ||
      (sharing.scope === "selected" && sharing.selectedGuildIds.split(",").includes(targetId));
  }

  /** Include disabled and conflicting commands so administrators can repair them. */
  public async listAvailable(client: SharingDirectory, target: SharingGuild): Promise<CustomCommandRecord[]> {
    const [local, grants] = await Promise.all([
      this.commands.listCommands(target.id),
      this.repository.available(target.id),
    ]);
    const result = local.map((command) => ({ ...command,
      sharingScope: grants.find((grant) => grant.guildId === target.id && grant.commandId === command.id)?.scope ?? "server" as const,
    }));
    const access = new Map<string, Promise<boolean>>();
    const canManage = (guild: SharingGuild, actor: string) => {
      const key = `${guild.id}:${actor}`;
      if (!access.has(key)) access.set(key, this.canManage(guild, actor));
      return access.get(key)!;
    };
    const records = new Map<string, Promise<CustomCommandRecord[]>>();
    for (const grant of grants) {
      if (grant.guildId === target.id || !this.includes(grant, target.id)) continue;
      const source = client.get(grant.guildId);
      if (!source) continue;
      const allowed = await Promise.all([canManage(source, grant.actorId), canManage(target, grant.actorId)]);
      if (!allowed.every(Boolean)) continue;
      if (!records.has(source.id)) {
        this.commands.invalidate(source.id);
        records.set(source.id, this.commands.listCommands(source.id));
      }
      const command = (await records.get(source.id)!).find((row) => row.id === grant.commandId);
      if (command) result.push({ ...command, guildId: target.id, sourceGuildId: source.id, sharingScope: grant.scope });
    }
    return result;
  }

  /** Recheck the grant and the editor's access on every shared mutation. */
  public async forManagement(client: SharingDirectory, target: SharingGuild, actorId: string, command: CustomCommandRecord) {
    const sourceId = command.sourceGuildId ?? command.guildId;
    const source = client.get(sourceId);
    if (!source || command.guildId !== target.id)
      throw new CustomCommandValidationError("This shared command is no longer available. Refresh settings.");
    const allowed = await Promise.all([
      this.canManage(source, actorId), this.canManage(target, actorId),
    ]);
    if (!allowed.every(Boolean))
      throw new CustomCommandValidationError("Administrator permission and verified ownership are required in both the original and current servers to edit a shared command.");
    if (sourceId !== target.id) {
      const grant = await this.repository.get(sourceId, command.id);
      if (!grant || !this.includes(grant, target.id) ||
          !(await this.canManage(source, grant.actorId)) ||
          !(await this.canManage(target, grant.actorId)))
        throw new CustomCommandValidationError("This command is no longer shared with this server. Refresh settings.");
    }
    this.commands.invalidate(sourceId);
    const current = (await this.commands.listCommands(sourceId)).find((row) => row.id === command.id);
    if (!current)
      throw new CustomCommandValidationError("This command was removed. Refresh settings.");
    return current;
  }

  private async conflicts(
    client: SharingDirectory,
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
    const canManage = async (guild: SharingGuild, actor: string) => {
      const key = `${guild.id}:${actor}`;
      if (!access.has(key)) access.set(key, await this.canManage(guild, actor));
      return access.get(key)!;
    };
    const conflicts: SharingConflict[] = [];
    for (const target of targets) {
      const guild = client.get(target.id);
      if (!guild)
        throw new CustomCommandValidationError(
          "Refresh the server list before saving.",
        );
      const locals = await load(target.id);
      const localNames = new Set(locals.flatMap((row) => [row.name, ...row.aliases]));
      const replacements = locals.filter((row) => [row.name, ...row.aliases].some((name) => names.includes(name)));
      let replaceable = true;
      for (const local of replacements) {
        if (await this.repository.get(target.id, local.id)) replaceable = false;
      }
      const duplicateNames: string[] = [];
      for (const name of names) {
        const legacy = await this.repository.hasLegacyName(target.id, name);
        if (legacy) replaceable = false;
        let duplicate = localNames.has(name) || legacy;
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
          const source = client.get(sharing.guildId);
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
            replaceable = false;
            break;
          }
        }
        if (duplicate) duplicateNames.push(name);
      }
      if (duplicateNames.length)
        conflicts.push({
          guildId: target.id,
          guildName: target.name,
          names: duplicateNames,
          replacements: replacements.map(({ id, updatedAt }) => ({ id, updatedAt })),
          replaceable,
        });
    }
    return conflicts.sort((a, b) => a.guildId.localeCompare(b.guildId));
  }

  public async save(
    client: SharingDirectory,
    actorId: string,
    command: CustomCommandRecord,
    scope: CommandScope,
    selected: string[],
    confirmation?: string,
    resolution: "keep" | "replace" = "keep",
  ) {
    let replacements: SharingConflict[] | undefined;
    if (!["keep", "replace"].includes(resolution))
      throw new CustomCommandValidationError("Choose Keep Existing or Replace Existing.");
    if (!["server", "all", "selected"].includes(scope))
      throw new CustomCommandValidationError("Choose a valid command scope.");
    if (command.sourceGuildId) {
      const target = client.get(command.guildId);
      if (!target) throw new CustomCommandValidationError("Refresh settings before saving.");
      const current = await this.forManagement(client, target, actorId, command);
      if (current.updatedAt !== command.updatedAt)
        throw new CustomCommandValidationError("This command changed. Refresh settings before saving its scope.");
      command = current;
    }
    const source = client.get(command.guildId);
    if (!source || !(await this.canManage(source, actorId)))
      throw new CustomCommandValidationError(
        "Administrator permission and verified ownership are required in the source server.",
      );
    if (scope !== "server" && hasServerRestrictions(command))
      throw new CustomCommandValidationError(
        "Clear server-specific role and channel restrictions and role actions in Customize before sharing. Discord permission requirements work across servers.",
      );
    const ids = [...new Set(selected)].filter((id) => id !== command.guildId);
    if (scope === "selected") {
      if (!ids.length || ids.length > 100)
        throw new CustomCommandValidationError("Choose 1–100 other servers.");
      for (const id of ids) {
        const guild = client.get(id);
        if (!guild || !(await this.canManage(guild, actorId)))
          throw new CustomCommandValidationError(
            "Every selected server must have verified ownership and you must be an administrator there. Refresh the server list.",
          );
      }
    }
    if (scope !== "server") {
      const targets =
        scope === "selected"
          ? ids.map((id) => ({ id, name: client.get(id)!.name }))
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
              conflicts,
            }),
          )
          .digest("hex");
        if (confirmation !== fingerprint)
          throw new CustomCommandSharingConflictError(conflicts, fingerprint);
        if (resolution === "replace") {
          if (conflicts.some((conflict) => !conflict.replaceable))
            throw new CustomCommandValidationError("Only server custom commands can be replaced here. Rename or remove conflicting legacy or shared commands, or remove their sharing scope first.");
          replacements = conflicts;
        }
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
      ...(replacements ? [replacements] : []),
    );
    for (const conflict of replacements ?? []) this.commands.invalidate(conflict.guildId);
  }

  /** Local names win. Multiple shared matches fail closed instead of picking an arbitrary source. */
  public async resolve(
    client: SharingDirectory,
    target: SharingGuild,
    name: string,
  ): Promise<CustomCommandRecord | null> {
    name = name.trim().toLowerCase();
    if (this.commands.isReserved(name)) return null;
    const [hasLegacyName, candidates] = await Promise.all([
      this.repository.hasLegacyName(target.id, name),
      this.repository.candidates(name),
    ]);
    if (hasLegacyName || candidates.length > 100) return null;
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
      const source = client.get(sharing.guildId);
      if (!source) continue;
      const [sourceAccess, targetAccess] = await Promise.all([
        this.canManage(source, sharing.actorId),
        this.canManage(target, sharing.actorId),
      ]);
      if (!sourceAccess || !targetAccess) continue;
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
