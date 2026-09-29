#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/040a150843f63d92c046004c8b09ba1beb5f1fef07f13e9586c8b2cf18d635ef/contract';
import startContract from '../../snapshots/040a150843f63d92c046004c8b09ba1beb5f1fef07f13e9586c8b2cf18d635ef/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/f08023eaa87e6ec987efb9e262ce4034d583c4d542b246e92cea18fee725eadb/contract';
import endContract from '../../snapshots/f08023eaa87e6ec987efb9e262ce4034d583c4d542b246e92cea18fee725eadb/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'guildOwnership',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('guildId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('ownerUserId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('verifiedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'guildOwnership',
        constraint: 'guildOwnership_guildId_key',
        columns: ['guildId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'guildOwnership',
        index: 'guildOwnership_ownerUserId_idx_f93ae154',
        columns: ['ownerUserId'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
