#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/6e1d581ee56a84e22be7358333ed4cd8aa4283c3939a277e696640a4afa15252/contract';
import startContract from '../../snapshots/6e1d581ee56a84e22be7358333ed4cd8aa4283c3939a277e696640a4afa15252/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/8a8f7abe3eda27e85d9e776a0ca06c36ef6dabf2b6e4767f0468f9acf10a17af/contract';
import endContract from '../../snapshots/8a8f7abe3eda27e85d9e776a0ca06c36ef6dabf2b6e4767f0468f9acf10a17af/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'guild_config',
        column: col('xpCooldownSeconds', 'int4', {
          notNull: true,
          default: lit(60),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'guild_config',
        column: col('xpDailyAmount', 'int4', {
          notNull: true,
          default: lit(100),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'guild_config',
        column: col('xpMessageAmount', 'int4', {
          notNull: true,
          default: lit(15),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'guild_config',
        column: col('xpMethods', 'text', {
          notNull: true,
          default: lit('messages'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'guild_config',
        column: col('xpReactionAmount', 'int4', {
          notNull: true,
          default: lit(5),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'member_xp',
        column: col('lastDailyAwardedAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-string@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'member_xp',
        column: col('lastReactionAwardedAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-string@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
