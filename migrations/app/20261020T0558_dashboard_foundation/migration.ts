#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/01e9ce03a292435e66750ed685c656abd341f28a91aa637b01713841ab2926fb/contract';
import startContract from '../../snapshots/01e9ce03a292435e66750ed685c656abd341f28a91aa637b01713841ab2926fb/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/bc43e4ac52c3473f80bba83bbc94b1767fb9fd48e893aaa78052409db2da6579/contract';
import endContract from '../../snapshots/bc43e4ac52c3473f80bba83bbc94b1767fb9fd48e893aaa78052409db2da6579/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'dashboard_account',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('theme', 'text', {
            notNull: true,
            default: lit('dark'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'dashboard_event',
        columns: [
          col('actorId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('data', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('guildId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('summary', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'dashboard_operation',
        columns: [
          col('actorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('fingerprint', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('guildId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('key', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('result', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('pending'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['key'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'dashboard_plugin',
        columns: [
          col('config', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('enabled', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('guildId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('pluginId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('revision', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'dashboard_workflow',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('draft', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('enabled', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('guildId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('history', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('published', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('revision', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('updatedBy', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'dashboard_plugin',
        constraint: 'dashboard_plugin_guildId_pluginId_key',
        columns: ['guildId', 'pluginId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'dashboard_workflow',
        constraint: 'dashboard_workflow_guildId_name_key',
        columns: ['guildId', 'name'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'dashboard_event',
        index: 'dashboard_event_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'dashboard_event',
        index: 'dashboard_event_guildId_id_idx_858685e6',
        columns: ['guildId', 'id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'dashboard_operation',
        index: 'dashboard_operation_guildId_createdAt_idx_058cef23',
        columns: ['guildId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'dashboard_workflow',
        index: 'dashboard_workflow_guildId_enabled_idx_6243d9dc',
        columns: ['guildId', 'enabled'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
