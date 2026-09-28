#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/289e75ce386293667f9839c22b44e60ed30997d855a5843fa1032c10c4beb58a/contract';
import startContract from '../../snapshots/289e75ce386293667f9839c22b44e60ed30997d855a5843fa1032c10c4beb58a/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/6e1d581ee56a84e22be7358333ed4cd8aa4283c3939a277e696640a4afa15252/contract';
import endContract from '../../snapshots/6e1d581ee56a84e22be7358333ed4cd8aa4283c3939a277e696640a4afa15252/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'member_xp',
        columns: [
          col('guildId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('lastAwardedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('xp', 'int4', { notNull: true, default: lit(0), codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'guild_config',
        column: col('xpEnabled', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'guild_config',
        column: col('xpSharedGuildIds', 'text', {
          notNull: true,
          default: lit(''),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'guild_config',
        column: col('xpSharing', 'text', {
          notNull: true,
          default: lit('server'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'member_xp',
        constraint: 'member_xp_guildId_userId_key',
        columns: ['guildId', 'userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'member_xp',
        index: 'member_xp_userId_idx_a489d58a',
        columns: ['userId'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
