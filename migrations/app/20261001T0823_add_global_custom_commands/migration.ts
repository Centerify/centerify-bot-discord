#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/adf9e5daa831ad7bd2952be7f4abe465581297eea1cd6210a885c91048ccd409/contract';
import startContract from '../../snapshots/adf9e5daa831ad7bd2952be7f4abe465581297eea1cd6210a885c91048ccd409/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/df20bae832736ee95d4cf42a28c5a77caed74127d06a719b1aa6a68c4bb623e0/contract';
import endContract from '../../snapshots/df20bae832736ee95d4cf42a28c5a77caed74127d06a719b1aa6a68c4bb623e0/contract.json' with { type: 'json' };
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
        table: 'custom_command',
        columns: [
          col('content', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('cooldownScope', 'text', {
            notNull: true,
            default: lit('USER'),
            codecRef: { codecId: 'pg/text@1' },
          }),
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
          col('deleteInvocation', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('description', 'text', {
            notNull: true,
            default: lit(''),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('enabled', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('guildId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('lastUsedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('replyToInvocation', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('responseType', 'text', {
            notNull: true,
            default: lit('TEXT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('triggerType', 'text', {
            notNull: true,
            default: lit('BOTH'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('updatedBy', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('usageCount', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'custom_command_cooldown_6f7f823d',
            '"cooldownSeconds" >= 0 AND "cooldownSeconds" <= 86400',
          ),
          checkExpression('custom_command_normalized_name_3dad82ba', 'name = lower(btrim(name))'),
          checkExpression(
            'custom_command_response_b4a3f921',
            "\"responseType\" IN ('TEXT', 'EMBED', 'MULTI')",
          ),
          checkExpression(
            'custom_command_scope_3827e66b',
            "\"cooldownScope\" IN ('USER', 'CHANNEL', 'GUILD', 'GLOBAL_COMMAND')",
          ),
          checkExpression(
            'custom_command_trigger_f7eca854',
            "\"triggerType\" IN ('SLASH', 'MESSAGE', 'BOTH')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'custom_command_name',
        columns: [
          col('commandId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('guildId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('custom_command_name_normalized_3dad82ba', 'name = lower(btrim(name))'),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'custom_command_restriction',
        columns: [
          col('commandId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('guildId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('kind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('value', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'custom_command_restriction_kind_0b28cb65',
            "kind IN ('allowedRoleIds', 'deniedRoleIds', 'allowedChannelIds', 'deniedChannelIds', 'requiredUserPermissions', 'requiredBotPermissions')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'custom_command',
        constraint: 'custom_command_guildId_id_key',
        columns: ['guildId', 'id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'custom_command',
        constraint: 'custom_command_guildId_name_key',
        columns: ['guildId', 'name'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'custom_command_name',
        constraint: 'custom_command_name_guildId_name_key',
        columns: ['guildId', 'name'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'custom_command_restriction',
        constraint: 'custom_command_restriction_guildId_commandId_kind_value_key',
        columns: ['guildId', 'commandId', 'kind', 'value'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'custom_command',
        index: 'custom_command_enabled_idx_7f014af8',
        columns: ['enabled'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'custom_command',
        index: 'custom_command_guildId_enabled_triggerType_idx_df732914',
        columns: ['guildId', 'enabled', 'triggerType'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'custom_command',
        index: 'custom_command_triggerType_idx_fe2bcd74',
        columns: ['triggerType'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'custom_command_name',
        index: 'custom_command_name_guildId_commandId_idx_eb216ee4',
        columns: ['guildId', 'commandId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'custom_command_restriction',
        index: 'custom_command_restriction_guildId_commandId_idx_eb216ee4',
        columns: ['guildId', 'commandId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'custom_command_name',
        foreignKey: {
          name: 'custom_command_name_guildId_commandId_fkey',
          columns: ['guildId', 'commandId'],
          references: { schema: 'public', table: 'custom_command', columns: ['guildId', 'id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'custom_command_restriction',
        foreignKey: {
          name: 'custom_command_restriction_guildId_commandId_fkey',
          columns: ['guildId', 'commandId'],
          references: { schema: 'public', table: 'custom_command', columns: ['guildId', 'id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
