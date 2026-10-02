import { db } from "../../prisma/db.js";
import { CustomCommandValidationError } from "../../lib/customCommands/errors.js";
import type { CustomCommandRecord } from "../../lib/customCommands/types.js";
import {
  hasServerRestrictions,
  type CommandSharing,
  type SharingRepository,
} from "./CustomCommandSharingService.js";

export class PrismaCommandSharingRepository implements SharingRepository {
  public async get(
    guildId: string,
    commandId: number,
  ): Promise<CommandSharing | null> {
    const row = await db.orm.public.CustomCommandSharing.where({
      guildId,
      commandId,
    }).first();
    return row ? { ...row, scope: row.scope as CommandSharing["scope"] } : null;
  }
  public async candidates(name: string): Promise<CommandSharing[]> {
    const rows = await db.transaction((tx) =>
      tx.query(
        db.raw.sql`
      SELECT s."guildId", s."commandId", s."actorId", s.scope, s."selectedGuildIds"
      FROM public.custom_command_sharing s
      JOIN public.custom_command_name n ON n."guildId" = s."guildId" AND n."commandId" = s."commandId"
      WHERE n.name = ${name}
      LIMIT 101
    `
          .returnsRow({
            guildId: "pg/text@1",
            commandId: "pg/int4@1",
            actorId: "pg/text@1",
            scope: "pg/text@1",
            selectedGuildIds: "pg/text@1",
          })
          .build(),
      ),
    );
    return rows.map((row) => ({
      ...row,
      scope: row.scope as CommandSharing["scope"],
    }));
  }
  public async hasLegacyName(guildId: string, name: string): Promise<boolean> {
    return (
      await db.orm.public.CustomResponse.where({
        guildId,
        kind: "command",
      }).all()
    ).some((rule) => rule.trigger === name);
  }
  public async save(
    command: CustomCommandRecord,
    sharing: CommandSharing | null,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.query(
        db.raw
          .sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`centerify:custom-responses:${command.guildId}`}, 0))`
          .returnsRow({ locked: "pg/int4@1" })
          .build(),
      );
      const current = await tx.orm.public.CustomCommand.where({
        guildId: command.guildId,
        id: command.id,
      }).first();
      if (!current || current.updatedAt !== command.updatedAt)
        throw new CustomCommandValidationError(
          "This command changed. Refresh settings before saving its scope.",
        );
      const restrictions = await tx.orm.public.CustomCommandRestriction.where({
        guildId: command.guildId,
        commandId: command.id,
      }).all();
      if (
        sharing &&
        (hasServerRestrictions(command) ||
          restrictions.some((row) =>
            [
              "allowedRoleIds",
              "deniedRoleIds",
              "allowedChannelIds",
              "deniedChannelIds",
            ].includes(row.kind),
          ))
      )
        throw new CustomCommandValidationError(
          "Clear server-specific role and channel restrictions before sharing.",
        );
      if (sharing)
        await tx.orm.public.CustomCommandSharing.upsert({
          conflictOn: { commandId: command.id },
          create: sharing,
          update: {
            actorId: sharing.actorId,
            scope: sharing.scope,
            selectedGuildIds: sharing.selectedGuildIds,
          },
        });
      else
        await tx.orm.public.CustomCommandSharing.where({
          guildId: command.guildId,
          commandId: command.id,
        }).deleteAll();
    });
  }
}
