#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/040a150843f63d92c046004c8b09ba1beb5f1fef07f13e9586c8b2cf18d635ef/contract';
import endContract from '../../snapshots/040a150843f63d92c046004c8b09ba1beb5f1fef07f13e9586c8b2cf18d635ef/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/c81989c89a34cd55e3bf3b3cfd7fa7914e33bc5cbda56eb5322d48056fa19a21/contract';
import startContract from '../../snapshots/c81989c89a34cd55e3bf3b3cfd7fa7914e33bc5cbda56eb5322d48056fa19a21/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
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
        table: 'memberReport',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('guildId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('reason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reportNumber', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('reportedUserId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reporterUserId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reviewedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('reviewedBy', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'memberReport_status_check_904c6455',
            "\"status\" IN ('PENDING', 'ACCEPTED', 'REJECTED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'moderationCase',
        columns: [
          col('action', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('caseNumber', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('durationMs', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('guildId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('metadata', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('moderatorUserId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('targetUserId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'moderationCase_action_check_49883d64',
            "\"action\" IN ('WARNING', 'TIMEOUT', 'KICK', 'BAN', 'UNBAN', 'NOTE')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'moderationCaseCounter',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('guildId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('nextCaseNumber', 'int4', {
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
        table: 'reportCounter',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('guildId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('nextReportNumber', 'int4', {
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
      this.addUnique({
        schema: 'public',
        table: 'memberReport',
        constraint: 'memberReport_guildId_reportNumber_key',
        columns: ['guildId', 'reportNumber'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'moderationCase',
        constraint: 'moderationCase_guildId_caseNumber_key',
        columns: ['guildId', 'caseNumber'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'moderationCaseCounter',
        constraint: 'moderationCaseCounter_guildId_key',
        columns: ['guildId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'reportCounter',
        constraint: 'reportCounter_guildId_key',
        columns: ['guildId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'memberReport',
        index: 'memberReport_guildId_createdAt_idx_058cef23',
        columns: ['guildId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'memberReport',
        index: 'memberReport_guildId_reportedUserId_idx_c12523fc',
        columns: ['guildId', 'reportedUserId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'memberReport',
        index: 'memberReport_guildId_reporterUserId_idx_f83dc8fa',
        columns: ['guildId', 'reporterUserId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'memberReport',
        index: 'memberReport_guildId_status_idx_1c75905a',
        columns: ['guildId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'moderationCase',
        index: 'moderationCase_guildId_action_idx_473346f7',
        columns: ['guildId', 'action'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'moderationCase',
        index: 'moderationCase_guildId_createdAt_idx_058cef23',
        columns: ['guildId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'moderationCase',
        index: 'moderationCase_guildId_moderatorUserId_idx_5a51b46e',
        columns: ['guildId', 'moderatorUserId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'moderationCase',
        index: 'moderationCase_guildId_targetUserId_idx_03f6a49f',
        columns: ['guildId', 'targetUserId'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
