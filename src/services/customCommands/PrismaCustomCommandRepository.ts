import type { FieldInputTypes } from "../../prisma/contract.d.js";
import { db } from "../../prisma/db.js";
import { RESTRICTION_KEYS } from "../../lib/customCommands/constants.js";
import type {
  CustomCommandDefinition,
  CustomCommandRecord,
  CustomCommandRepository,
  CustomCommandTransaction,
} from "../../lib/customCommands/types.js";
import { CustomCommandValidator } from "./CustomCommandValidator.js";

type Database = Pick<typeof db, "orm">;
const validator = new CustomCommandValidator();
async function list(
  database: Database,
  guildId: string,
): Promise<CustomCommandRecord[]> {
  // This Prisma version's include path does not correlate composite relations
  // on all columns. Join bounded, guild-scoped reads by commandId explicitly.
  const [rows, names, restrictions] = await Promise.all([
    database.orm.public.CustomCommand.where({ guildId }).all(),
    database.orm.public.CustomCommandName.where({ guildId }).all(),
    database.orm.public.CustomCommandRestriction.where({ guildId }).all(),
  ]);
  const namesByCommand = new Map<number, string[]>();
  for (const entry of names) {
    const values = namesByCommand.get(entry.commandId) ?? [];
    values.push(entry.name);
    namesByCommand.set(entry.commandId, values);
  }
  const restrictionsByCommand = new Map<number, Map<string, string[]>>();
  for (const entry of restrictions) {
    const kinds =
      restrictionsByCommand.get(entry.commandId) ?? new Map<string, string[]>();
    const values = kinds.get(entry.kind) ?? [];
    values.push(entry.value);
    kinds.set(entry.kind, values);
    restrictionsByCommand.set(entry.commandId, kinds);
  }
  return rows.map((row) => {
    // Treat stored response JSON and persisted enums as untrusted, too.
    const definition = validator.definition({
      name: row.name,
      description: row.description,
      enabled: row.enabled,
      triggerType: row.triggerType,
      responseType: row.responseType,
      content: row.content,
      aliases: (namesByCommand.get(row.id) ?? []).filter(
        (name) => name !== row.name,
      ),
      cooldownSeconds: row.cooldownSeconds,
      cooldownScope: row.cooldownScope,
      deleteInvocation: row.deleteInvocation,
      replyToInvocation: row.replyToInvocation,
      ...Object.fromEntries(
        RESTRICTION_KEYS.map((key) => [
          key,
          restrictionsByCommand.get(row.id)?.get(key) ?? [],
        ]),
      ),
    });
    return {
      ...definition,
      id: row.id,
      guildId: row.guildId,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      usageCount: row.usageCount,
      lastUsedAt: row.lastUsedAt,
    };
  });
}
export class PrismaCustomCommandRepository implements CustomCommandRepository {
  public list(guildId: string): Promise<CustomCommandRecord[]> {
    // Serialize this cached snapshot with namespace writes so its three reads
    // cannot mix pre-edit and post-edit child rows under READ COMMITTED.
    return this.mutate(guildId, (tx) => tx.list());
  }
  public mutate<T>(
    guildId: string,
    operation: (tx: CustomCommandTransaction) => Promise<T>,
  ): Promise<T> {
    return db.transaction(async (tx) => {
      // Shared with legacy custom responses: both domains claim the same prefix namespace.
      await tx.query(
        db.raw
          .sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`centerify:custom-responses:${guildId}`}, 0))`
          .returnsRow({ locked: "pg/int4@1" })
          .build(),
      );
      return operation({
        list: () => list(tx, guildId),
        legacyNames: async () =>
          (await tx.orm.public.CustomResponse.where({ guildId }).all()).flatMap(
            (rule) =>
              rule.kind === "command" ? [rule.name, rule.trigger] : [rule.name],
          ),
        save: async (
          definition: CustomCommandDefinition,
          actorId: string,
          id?: number,
        ) => {
          const { aliases, ...rest } = definition;
          const {
            allowedRoleIds,
            deniedRoleIds,
            allowedChannelIds,
            deniedChannelIds,
            requiredUserPermissions,
            requiredBotPermissions,
            ...fields
          } = rest;
          // Jsonb has a JSON-value type; roundtrip excludes undefined and makes the boundary explicit.
          const content = JSON.parse(
            JSON.stringify(fields.content),
          ) as FieldInputTypes["public"]["CustomCommand"]["content"];
          const payload = { ...fields, content, updatedBy: actorId };
          const saved =
            id === undefined
              ? await tx.orm.public.CustomCommand.create({
                  ...payload,
                  guildId,
                  createdBy: actorId,
                })
              : await tx.orm.public.CustomCommand.where({ guildId, id }).update(
                  payload,
                );
          if (!saved)
            throw new Error("Custom command save did not return a record.");
          const commandId = saved.id;
          if (id !== undefined) {
            await tx.orm.public.CustomCommandName.where({
              guildId,
              commandId,
            }).deleteAll();
            await tx.orm.public.CustomCommandRestriction.where({
              guildId,
              commandId,
            }).deleteAll();
          }
          for (const name of [definition.name, ...aliases])
            await tx.orm.public.CustomCommandName.create({
              guildId,
              commandId,
              name,
            });
          for (const kind of RESTRICTION_KEYS)
            for (const value of definition[kind])
              await tx.orm.public.CustomCommandRestriction.create({
                guildId,
                commandId,
                kind,
                value,
              });
          return {
            ...structuredClone(definition),
            id: commandId,
            guildId,
            createdBy: saved.createdBy,
            updatedBy: saved.updatedBy,
            createdAt: saved.createdAt,
            updatedAt: saved.updatedAt,
            usageCount: saved.usageCount,
            lastUsedAt: saved.lastUsedAt,
          };
        },
        remove: async (id) => {
          await tx.orm.public.CustomCommandName.where({
            guildId,
            commandId: id,
          }).deleteAll();
          await tx.orm.public.CustomCommandRestriction.where({
            guildId,
            commandId: id,
          }).deleteAll();
          await tx.orm.public.CustomCommand.where({ guildId, id }).delete();
        },
      });
    });
  }
  public async recordUsage(guildId: string, commandId: number): Promise<void> {
    await db
      .runtime()
      .execute(
        db.raw
          .sql`UPDATE public.custom_command SET "usageCount" = "usageCount" + 1, "lastUsedAt" = now() WHERE "guildId" = ${guildId} AND id = ${commandId}`
          .affectedCount()
          .build(),
      );
  }
}
