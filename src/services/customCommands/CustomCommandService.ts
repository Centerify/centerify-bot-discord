import { logger } from "../../logger.js";
import {
  CUSTOM_COMMAND_LIMITS as L,
  PROTECTED_COMMAND_NAMES,
  RESTRICTION_KEYS,
} from "../../lib/customCommands/constants.js";
import {
  CustomCommandAlreadyExistsError,
  CustomCommandLimitError,
  CustomCommandNotFoundError,
  CustomCommandValidationError,
} from "../../lib/customCommands/errors.js";
import type {
  CustomCommandDefinition,
  CustomCommandRecord,
  CustomCommandRepository,
  CustomCommandTransaction,
} from "../../lib/customCommands/types.js";
import { CustomCommandCache } from "./CustomCommandCache.js";
import {
  CustomCommandValidator,
  normalizeCommandName,
  object,
} from "./CustomCommandValidator.js";

export function exportDefinition(
  command: CustomCommandRecord,
): CustomCommandDefinition {
  const {
    name,
    description,
    enabled,
    triggerType,
    responseType,
    content,
    aliases,
    cooldownSeconds,
    cooldownScope,
    deleteInvocation,
    replyToInvocation,
  } = command;
  return structuredClone({
    name,
    description,
    enabled,
    triggerType,
    responseType,
    content,
    aliases,
    cooldownSeconds,
    cooldownScope,
    deleteInvocation,
    replyToInvocation,
    ...Object.fromEntries(RESTRICTION_KEYS.map((key) => [key, command[key]])),
  } as CustomCommandDefinition);
}
interface GuildCommands {
  records: CustomCommandRecord[];
  names: Map<string, CustomCommandRecord>;
}
export class CustomCommandService {
  private readonly cache = new CustomCommandCache<GuildCommands>();
  public constructor(
    private readonly repository: CustomCommandRepository,
    public readonly validator = new CustomCommandValidator(),
    private readonly reservedNames: () => Iterable<string> = () =>
      PROTECTED_COMMAND_NAMES,
    private readonly maxCommands: number = L.commandsPerGuild,
    private readonly validateReferences: (
      guildId: string,
      definitions: CustomCommandDefinition[],
    ) => Promise<void> = async () => {},
  ) {}
  public invalidate(guildId: string): void {
    this.cache.invalidate(guildId);
  }
  private load(guildId: string): Promise<GuildCommands> {
    return this.cache.get(guildId, async () => {
      const records = await this.repository.list(guildId);
      if (records.some((record) => record.guildId !== guildId))
        throw new Error("Custom command repository violated guild isolation.");
      const names = new Map<string, CustomCommandRecord>();
      for (const record of records)
        for (const name of [record.name, ...record.aliases])
          names.set(name, record);
      return { records, names };
    });
  }
  public async listCommands(guildId: string): Promise<CustomCommandRecord[]> {
    return structuredClone((await this.load(guildId)).records);
  }
  public async getCommand(
    guildId: string,
    name: string,
  ): Promise<CustomCommandRecord | null> {
    const normalized = normalizeCommandName(name);
    const found = (await this.load(guildId)).names.get(normalized);
    return found?.name === normalized ? structuredClone(found) : null;
  }
  public async getCommandByNameOrAlias(
    guildId: string,
    name: string,
  ): Promise<CustomCommandRecord | null> {
    // A newly registered built-in always wins, even over an older stored command.
    if (this.isReserved(name)) return null;
    const found = (await this.load(guildId)).names.get(
      normalizeCommandName(name),
    );
    return found ? structuredClone(found) : null;
  }
  public isReserved(name: string): boolean {
    const normalized = normalizeCommandName(name);
    return [...PROTECTED_COMMAND_NAMES, ...this.reservedNames()].some(
      (reserved) => normalizeCommandName(reserved) === normalized,
    );
  }
  private checkNames(
    definition: CustomCommandDefinition,
    records: CustomCommandRecord[],
    legacyNames: string[],
    excludeId?: number,
  ): void {
    const occupied = new Set([
      ...legacyNames.map(normalizeCommandName),
      ...records
        .filter((record) => record.id !== excludeId)
        .flatMap((record) => [record.name, ...record.aliases]),
    ]);
    for (const name of [definition.name, ...definition.aliases]) {
      if (this.isReserved(name))
        throw new CustomCommandValidationError(
          `The name \`${name}\` is reserved by a built-in command.`,
        );
      if (occupied.has(name))
        throw new CustomCommandAlreadyExistsError(
          `A custom command or alias named \`${name}\` already exists.`,
        );
    }
  }
  private find(
    records: CustomCommandRecord[],
    name: string,
  ): CustomCommandRecord {
    const found = records.find(
      (record) => record.name === normalizeCommandName(name),
    );
    if (!found)
      throw new CustomCommandNotFoundError(
        `No custom command named \`${name.slice(0, L.name)}\` exists.`,
      );
    return found;
  }
  private async mutation<T>(
    guildId: string,
    actorId: string,
    event: string,
    operation: (tx: CustomCommandTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      const result = await this.repository.mutate(guildId, operation);
      this.invalidate(guildId);
      const record =
        result &&
        typeof result === "object" &&
        "name" in result &&
        "id" in result
          ? result
          : undefined;
      logger.info(
        {
          guildId,
          userId: actorId,
          ...(record ? { commandName: record.name, commandId: record.id } : {}),
        },
        `custom_command.${event}`,
      );
      return result;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "sqlState" in error &&
        error.sqlState === "23505"
      )
        throw new CustomCommandAlreadyExistsError(
          "A custom command name or alias is already in use.",
        );
      throw error;
    }
  }
  public async createCommand(
    guildId: string,
    actorId: string,
    input: unknown,
  ): Promise<CustomCommandRecord> {
    const definition = this.validator.definition(input);
    return this.mutation(guildId, actorId, "created", async (tx) => {
      const records = await tx.list();
      if (records.length >= this.maxCommands)
        throw new CustomCommandLimitError(
          `This server can have at most ${this.maxCommands} custom commands.`,
        );
      await this.validateReferences(guildId, [definition]);
      this.checkNames(definition, records, await tx.legacyNames());
      return tx.save(definition, actorId);
    });
  }
  public updateCommand(
    guildId: string,
    actorId: string,
    name: string,
    patch: Partial<CustomCommandDefinition>,
    event = "updated",
    expectedUpdatedAt?: string,
  ): Promise<CustomCommandRecord> {
    return this.mutation(guildId, actorId, event, async (tx) => {
      const records = await tx.list();
      const current = this.find(records, name);
      if (expectedUpdatedAt && current.updatedAt !== expectedUpdatedAt)
        throw new CustomCommandValidationError(
          "This command changed while the editor was open. Reopen it before saving.",
        );
      const definition = this.validator.definition({
        ...exportDefinition(current),
        ...patch,
      });
      await this.validateReferences(guildId, [definition]);
      this.checkNames(definition, records, await tx.legacyNames(), current.id);
      return tx.save(definition, actorId, current.id);
    });
  }
  public deleteCommand(
    guildId: string,
    actorId: string,
    name: string,
  ): Promise<CustomCommandRecord> {
    return this.mutation(guildId, actorId, "deleted", async (tx) => {
      const current = this.find(await tx.list(), name);
      await tx.remove(current.id);
      return current;
    });
  }
  public enableCommand(guildId: string, actorId: string, name: string) {
    return this.updateCommand(
      guildId,
      actorId,
      name,
      { enabled: true },
      "enabled",
    );
  }
  public disableCommand(guildId: string, actorId: string, name: string) {
    return this.updateCommand(
      guildId,
      actorId,
      name,
      { enabled: false },
      "disabled",
    );
  }
  public renameCommand(
    guildId: string,
    actorId: string,
    name: string,
    newName: string,
  ) {
    return this.updateCommand(guildId, actorId, name, { name: newName });
  }
  public cloneCommand(
    guildId: string,
    actorId: string,
    name: string,
    newName: string,
  ): Promise<CustomCommandRecord> {
    return this.mutation(guildId, actorId, "created", async (tx) => {
      const records = await tx.list();
      const original = this.find(records, name);
      if (records.length >= this.maxCommands)
        throw new CustomCommandLimitError(
          `This server can have at most ${this.maxCommands} custom commands.`,
        );
      const definition = this.validator.definition({
        ...exportDefinition(original),
        name: newName,
        aliases: [],
      });
      await this.validateReferences(guildId, [definition]);
      this.checkNames(definition, records, await tx.legacyNames());
      return tx.save(definition, actorId);
    });
  }
  public async exportCommands(guildId: string): Promise<string> {
    return JSON.stringify(
      {
        version: 1,
        commands: (await this.listCommands(guildId)).map(exportDefinition),
      },
      null,
      2,
    );
  }
  public async importCommands(
    guildId: string,
    actorId: string,
    input: string,
  ): Promise<number> {
    if (Buffer.byteLength(input, "utf8") > L.importBytes)
      throw new CustomCommandValidationError("Import file is too large.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      throw new CustomCommandValidationError("Import must be valid JSON.");
    }
    const data = object(parsed, "Import", ["version", "commands"]);
    if (data.version !== 1)
      throw new CustomCommandValidationError(
        "Unsupported import schema version. Expected version 1.",
      );
    if (
      !Array.isArray(data.commands) ||
      data.commands.length > this.maxCommands
    )
      throw new CustomCommandValidationError(
        "Import must contain a bounded list of commands.",
      );
    const definitions = data.commands.map((command) =>
      this.validator.definition(command),
    );
    await this.validateReferences(guildId, definitions);
    return this.mutation(guildId, actorId, "imported", async (tx) => {
      const records = await tx.list();
      const legacy = await tx.legacyNames();
      if (records.length + definitions.length > this.maxCommands)
        throw new CustomCommandLimitError(
          `This server can have at most ${this.maxCommands} custom commands.`,
        );
      // Validate the entire namespace before saving. The transaction also rolls back on any failure.
      const names = [...legacy];
      for (const definition of definitions) {
        this.checkNames(definition, records, names);
        names.push(definition.name, ...definition.aliases);
      }
      for (const definition of definitions) await tx.save(definition, actorId);
      return definitions.length;
    });
  }
}
