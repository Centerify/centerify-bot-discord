#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/8a8f7abe3eda27e85d9e776a0ca06c36ef6dabf2b6e4767f0468f9acf10a17af/contract';
import startContract from '../../snapshots/8a8f7abe3eda27e85d9e776a0ca06c36ef6dabf2b6e4767f0468f9acf10a17af/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/adf9e5daa831ad7bd2952be7f4abe465581297eea1cd6210a885c91048ccd409/contract';
import endContract from '../../snapshots/adf9e5daa831ad7bd2952be7f4abe465581297eea1cd6210a885c91048ccd409/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'custom_response',
        columns: [
          col('adminOnly', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('allowedRoleId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('channelId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('cooldownSeconds', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('createdBy', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('embed', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('enabled', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('exactMatch', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('guildId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('kind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('response', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('trigger', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'custom_response',
        constraint: 'custom_response_guildId_name_key',
        columns: ['guildId', 'name'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'custom_response',
        index: 'custom_response_guildId_kind_enabled_idx_0ebf4a27',
        columns: ['guildId', 'kind', 'enabled'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
