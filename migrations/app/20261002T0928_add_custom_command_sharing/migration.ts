#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/8f45d6d1cc46b2fe3738fc8990f468c978137894031c5a92132729734c689b05/contract';
import endContract from '../../snapshots/8f45d6d1cc46b2fe3738fc8990f468c978137894031c5a92132729734c689b05/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/df20bae832736ee95d4cf42a28c5a77caed74127d06a719b1aa6a68c4bb623e0/contract';
import startContract from '../../snapshots/df20bae832736ee95d4cf42a28c5a77caed74127d06a719b1aa6a68c4bb623e0/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'custom_command_sharing',
        columns: [
          col('actorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('commandId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('guildId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('scope', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('selectedGuildIds', 'text', {
            notNull: true,
            default: lit(''),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['commandId']),
          checkExpression('custom_command_sharing_scope_21852f16', "scope IN ('all', 'selected')"),
        ],
      }),
      this.createIndex({
        schema: 'public',
        table: 'custom_command_sharing',
        index: 'custom_command_sharing_guildId_commandId_idx_eb216ee4',
        columns: ['guildId', 'commandId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'custom_command_sharing',
        index: 'custom_command_sharing_guildId_idx_b8c02cbb',
        columns: ['guildId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'custom_command_sharing',
        foreignKey: {
          name: 'custom_command_sharing_guildId_commandId_fkey',
          columns: ['guildId', 'commandId'],
          references: { schema: 'public', table: 'custom_command', columns: ['guildId', 'id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
