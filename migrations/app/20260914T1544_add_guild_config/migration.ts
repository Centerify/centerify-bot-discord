#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/6883200c0128776bfd0c35cf56b02422111f05ccc415e829d081246e9b66f51d/contract';
import startContract from '../../snapshots/6883200c0128776bfd0c35cf56b02422111f05ccc415e829d081246e9b66f51d/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/c81989c89a34cd55e3bf3b3cfd7fa7914e33bc5cbda56eb5322d48056fa19a21/contract';
import endContract from '../../snapshots/c81989c89a34cd55e3bf3b3cfd7fa7914e33bc5cbda56eb5322d48056fa19a21/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'guildConfig',
        columns: [
          col('autoRoleEnabled', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('autoRoleId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('goodbyeChannelId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('goodbyeEnabled', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('goodbyeMessage', 'text', {
            notNull: true,
            default: lit('{displayName} left **{server}**. We now have {memberCount} members.'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('guildId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('loggingChannelId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('loggingEnabled', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('setupCompleted', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('welcomeChannelId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('welcomeEnabled', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('welcomeMessage', 'text', {
            notNull: true,
            default: lit('Welcome {user} to **{server}**! You are member #{memberCount}.'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'guildConfig',
        constraint: 'guildConfig_guildId_key',
        columns: ['guildId'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
