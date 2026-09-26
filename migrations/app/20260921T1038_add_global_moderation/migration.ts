#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/2255065d08c08c4322ea0d9ea674107836742d9f6b40da98c68f1806fcac7994/contract';
import startContract from '../../snapshots/2255065d08c08c4322ea0d9ea674107836742d9f6b40da98c68f1806fcac7994/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/5a358934b4a780bf4571d7ab2b52062c467d02a59610bfdc1729537808ee1620/contract';
import endContract from '../../snapshots/5a358934b4a780bf4571d7ab2b52062c467d02a59610bfdc1729537808ee1620/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'guildConfig',
        column: col('globalBanEnabled', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'guildConfig',
        column: col('globalNoteEnabled', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'guildConfig',
        column: col('globalWarnEnabled', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'moderationCase',
        column: col('isGlobal', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'moderationCase',
        index: 'moderationCase_targetUserId_isGlobal_action_idx_6ac275c1',
        columns: ['targetUserId', 'isGlobal', 'action'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
