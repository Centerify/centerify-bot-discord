#!/usr/bin/env -S node
import type { Contract as End } from "../../snapshots/289e75ce386293667f9839c22b44e60ed30997d855a5843fa1032c10c4beb58a/contract";
import endContract from "../../snapshots/289e75ce386293667f9839c22b44e60ed30997d855a5843fa1032c10c4beb58a/contract.json" with { type: "json" };
import type { Contract as Start } from "../../snapshots/5a358934b4a780bf4571d7ab2b52062c467d02a59610bfdc1729537808ee1620/contract";
import startContract from "../../snapshots/5a358934b4a780bf4571d7ab2b52062c467d02a59610bfdc1729537808ee1620/contract.json" with { type: "json" };
import {
  Migration,
  MigrationCLI,
  rawSql,
} from "@prisma/orm-postgres/migration";

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: "rename_mixed_case_tables_to_snake_case",
        label: "Rename mixed-case tables to lowercase snake_case",
        summary:
          "Renames existing tables and their constraints and indexes in place",
        operationClass: "widening",
        target: {
          id: "postgres",
          details: {
            schema: "public",
            objectType: "table",
            name: "guildConfig",
          },
        },
        precheck: [
          {
            description:
              "verify old tables exist and destination names are unused",
            sql: `SELECT
              to_regclass('"public"."guildConfig"') IS NOT NULL
              AND to_regclass('"public"."guildOwnership"') IS NOT NULL
              AND to_regclass('"public"."guildOwnershipRequest"') IS NOT NULL
              AND to_regclass('"public"."memberReport"') IS NOT NULL
              AND to_regclass('"public"."moderationCase"') IS NOT NULL
              AND to_regclass('"public"."moderationCaseCounter"') IS NOT NULL
              AND to_regclass('"public"."reportCounter"') IS NOT NULL
              AND to_regclass('"public"."testRecord"') IS NOT NULL
              AND to_regclass('"public"."guild_config"') IS NULL
              AND to_regclass('"public"."guild_ownership"') IS NULL
              AND to_regclass('"public"."guild_ownership_request"') IS NULL
              AND to_regclass('"public"."member_report"') IS NULL
              AND to_regclass('"public"."moderation_case"') IS NULL
              AND to_regclass('"public"."moderation_case_counter"') IS NULL
              AND to_regclass('"public"."report_counter"') IS NULL
              AND to_regclass('"public"."test_record"') IS NULL AS "result"`,
          },
        ],
        execute: [
          {
            description: "rename guildConfig to guild_config",
            sql: 'ALTER TABLE "public"."guildConfig" RENAME TO "guild_config"',
          },
          {
            description: "rename guildOwnership to guild_ownership",
            sql: 'ALTER TABLE "public"."guildOwnership" RENAME TO "guild_ownership"',
          },
          {
            description:
              "rename guildOwnershipRequest to guild_ownership_request",
            sql: 'ALTER TABLE "public"."guildOwnershipRequest" RENAME TO "guild_ownership_request"',
          },
          {
            description: "rename memberReport to member_report",
            sql: 'ALTER TABLE "public"."memberReport" RENAME TO "member_report"',
          },
          {
            description: "rename moderationCase to moderation_case",
            sql: 'ALTER TABLE "public"."moderationCase" RENAME TO "moderation_case"',
          },
          {
            description:
              "rename moderationCaseCounter to moderation_case_counter",
            sql: 'ALTER TABLE "public"."moderationCaseCounter" RENAME TO "moderation_case_counter"',
          },
          {
            description: "rename reportCounter to report_counter",
            sql: 'ALTER TABLE "public"."reportCounter" RENAME TO "report_counter"',
          },
          {
            description: "rename testRecord to test_record",
            sql: 'ALTER TABLE "public"."testRecord" RENAME TO "test_record"',
          },
          {
            description: "rename guild config unique constraint",
            sql: 'ALTER TABLE "public"."guild_config" RENAME CONSTRAINT "guildConfig_guildId_key" TO "guild_config_guildId_key"',
          },
          {
            description: "rename guild ownership unique constraint",
            sql: 'ALTER TABLE "public"."guild_ownership" RENAME CONSTRAINT "guildOwnership_guildId_key" TO "guild_ownership_guildId_key"',
          },
          {
            description: "rename ownership request guild unique constraint",
            sql: 'ALTER TABLE "public"."guild_ownership_request" RENAME CONSTRAINT "guildOwnershipRequest_guildId_key" TO "guild_ownership_request_guildId_key"',
          },
          {
            description: "rename ownership request token unique constraint",
            sql: 'ALTER TABLE "public"."guild_ownership_request" RENAME CONSTRAINT "guildOwnershipRequest_tokenDigest_key" TO "guild_ownership_request_tokenDigest_key"',
          },
          {
            description: "rename member report unique constraint",
            sql: 'ALTER TABLE "public"."member_report" RENAME CONSTRAINT "memberReport_guildId_reportNumber_key" TO "member_report_guildId_reportNumber_key"',
          },
          {
            description: "rename moderation case unique constraint",
            sql: 'ALTER TABLE "public"."moderation_case" RENAME CONSTRAINT "moderationCase_guildId_caseNumber_key" TO "moderation_case_guildId_caseNumber_key"',
          },
          {
            description: "rename moderation case counter unique constraint",
            sql: 'ALTER TABLE "public"."moderation_case_counter" RENAME CONSTRAINT "moderationCaseCounter_guildId_key" TO "moderation_case_counter_guildId_key"',
          },
          {
            description: "rename report counter unique constraint",
            sql: 'ALTER TABLE "public"."report_counter" RENAME CONSTRAINT "reportCounter_guildId_key" TO "report_counter_guildId_key"',
          },
          {
            description: "rename ownership index",
            sql: 'ALTER INDEX "public"."guildOwnership_ownerUserId_idx_f93ae154" RENAME TO "guild_ownership_ownerUserId_idx_f93ae154"',
          },
          {
            description: "rename ownership request expiry index",
            sql: 'ALTER INDEX "public"."guildOwnershipRequest_expiresAt_idx_6b6b8c10" RENAME TO "guild_ownership_request_expiresAt_idx_6b6b8c10"',
          },
          {
            description: "rename ownership request owner index",
            sql: 'ALTER INDEX "public"."guildOwnershipRequest_ownerUserId_idx_f93ae154" RENAME TO "guild_ownership_request_ownerUserId_idx_f93ae154"',
          },
          {
            description: "rename member report creation index",
            sql: 'ALTER INDEX "public"."memberReport_guildId_createdAt_idx_058cef23" RENAME TO "member_report_guildId_createdAt_idx_058cef23"',
          },
          {
            description: "rename member report reported user index",
            sql: 'ALTER INDEX "public"."memberReport_guildId_reportedUserId_idx_c12523fc" RENAME TO "member_report_guildId_reportedUserId_idx_c12523fc"',
          },
          {
            description: "rename member report reporter index",
            sql: 'ALTER INDEX "public"."memberReport_guildId_reporterUserId_idx_f83dc8fa" RENAME TO "member_report_guildId_reporterUserId_idx_f83dc8fa"',
          },
          {
            description: "rename member report status index",
            sql: 'ALTER INDEX "public"."memberReport_guildId_status_idx_1c75905a" RENAME TO "member_report_guildId_status_idx_1c75905a"',
          },
          {
            description: "rename moderation case action index",
            sql: 'ALTER INDEX "public"."moderationCase_guildId_action_idx_473346f7" RENAME TO "moderation_case_guildId_action_idx_473346f7"',
          },
          {
            description: "rename moderation case creation index",
            sql: 'ALTER INDEX "public"."moderationCase_guildId_createdAt_idx_058cef23" RENAME TO "moderation_case_guildId_createdAt_idx_058cef23"',
          },
          {
            description: "rename moderation case moderator index",
            sql: 'ALTER INDEX "public"."moderationCase_guildId_moderatorUserId_idx_5a51b46e" RENAME TO "moderation_case_guildId_moderatorUserId_idx_5a51b46e"',
          },
          {
            description: "rename moderation case target index",
            sql: 'ALTER INDEX "public"."moderationCase_guildId_targetUserId_idx_03f6a49f" RENAME TO "moderation_case_guildId_targetUserId_idx_03f6a49f"',
          },
          {
            description: "rename moderation case global index",
            sql: 'ALTER INDEX "public"."moderationCase_targetUserId_isGlobal_action_idx_6ac275c1" RENAME TO "moderation_case_targetUserId_isGlobal_action_idx_6ac275c1"',
          },
          {
            description: "rename member report status check constraint",
            sql: 'ALTER TABLE "public"."member_report" RENAME CONSTRAINT "memberReport_status_check_904c6455" TO "member_report_status_check_904c6455"',
          },
          {
            description: "rename moderation case action check constraint",
            sql: 'ALTER TABLE "public"."moderation_case" RENAME CONSTRAINT "moderationCase_action_check_49883d64" TO "moderation_case_action_check_49883d64"',
          },
        ],
        postcheck: [
          {
            description:
              "verify all snake_case tables exist and old names are gone",
            sql: `SELECT
              to_regclass('"public"."guild_config"') IS NOT NULL
              AND to_regclass('"public"."guild_ownership"') IS NOT NULL
              AND to_regclass('"public"."guild_ownership_request"') IS NOT NULL
              AND to_regclass('"public"."member_report"') IS NOT NULL
              AND to_regclass('"public"."moderation_case"') IS NOT NULL
              AND to_regclass('"public"."moderation_case_counter"') IS NOT NULL
              AND to_regclass('"public"."report_counter"') IS NOT NULL
              AND to_regclass('"public"."test_record"') IS NOT NULL
              AND to_regclass('"public"."guildConfig"') IS NULL
              AND to_regclass('"public"."guildOwnership"') IS NULL
              AND to_regclass('"public"."guildOwnershipRequest"') IS NULL
              AND to_regclass('"public"."memberReport"') IS NULL
              AND to_regclass('"public"."moderationCase"') IS NULL
              AND to_regclass('"public"."moderationCaseCounter"') IS NULL
              AND to_regclass('"public"."reportCounter"') IS NULL
              AND to_regclass('"public"."testRecord"') IS NULL AS "result"`,
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
