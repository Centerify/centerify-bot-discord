#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/2255065d08c08c4322ea0d9ea674107836742d9f6b40da98c68f1806fcac7994/contract';
import endContract from '../../snapshots/2255065d08c08c4322ea0d9ea674107836742d9f6b40da98c68f1806fcac7994/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/f08023eaa87e6ec987efb9e262ce4034d583c4d542b246e92cea18fee725eadb/contract';
import startContract from '../../snapshots/f08023eaa87e6ec987efb9e262ce4034d583c4d542b246e92cea18fee725eadb/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'guildOwnershipRequest',
        columns: [
          col('acceptedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('acceptedByUserId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('guildId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('ownerUserId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tokenDigest', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'guildOwnershipRequest',
        constraint: 'guildOwnershipRequest_guildId_key',
        columns: ['guildId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'guildOwnershipRequest',
        constraint: 'guildOwnershipRequest_tokenDigest_key',
        columns: ['tokenDigest'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'guildOwnershipRequest',
        index: 'guildOwnershipRequest_expiresAt_idx_6b6b8c10',
        columns: ['expiresAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'guildOwnershipRequest',
        index: 'guildOwnershipRequest_ownerUserId_idx_f93ae154',
        columns: ['ownerUserId'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
