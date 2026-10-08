import { startTestApplication } from "../helpers/application.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Guild } from "discord.js";

// Only the explicit database-test command opts into live writes. Every row uses
// a unique synthetic guild ID so cleanup cannot affect Discord servers.
const databaseUrl = process.env.TEST_DATABASE_URL;
let testApplication: Awaited<ReturnType<typeof startTestApplication>> | undefined;
const prefix = `integration-${randomUUID()}`;
const guilds = ["a", "b", "duplicates", "limit", "moderation", "reports"].map((name) => `${prefix}-${name}`);
const [guildA, guildB, duplicateGuild, limitGuild, moderationGuild, reportGuild] = guilds;
let db: typeof import("../../src/adapters/prisma/client.js").db;
let config: typeof import("../../src/modules/guilds/discord/config.js").guildConfigService;
let custom: typeof import("../../src/modules/custom-commands/discord/legacyService.js").customResponseService;
let xp: typeof import("../../src/modules/xp/discord/services.js").xpService;
let ownership: typeof import("../../src/modules/guilds/discord/ownership.js").guildOwnershipService;
let cases: typeof import("../../src/modules/moderation/discord/services.js").moderationCaseService;
let reports: typeof import("../../src/modules/moderation/discord/services.js").reportService;

function rule(guildId: string, name: string, trigger = name) {
  return {
    guildId, name, trigger, kind: "command" as const, response: "Integration response",
    channelId: null, allowedRoleId: null, adminOnly: false, exactMatch: true,
    embed: false, cooldownSeconds: 0, createdBy: `${prefix}-owner`,
  };
}

describe.skipIf(!databaseUrl)("live PostgreSQL multi-server behavior", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
      testApplication = await startTestApplication();
    ({ db } = await import("../../src/adapters/prisma/client.js"));
    ({ guildConfigService: config } = await import("../../src/modules/guilds/discord/config.js"));
    ({ customResponseService: custom } = await import("../../src/modules/custom-commands/discord/legacyService.js"));
    ({ xpService: xp } = await import("../../src/modules/xp/discord/services.js"));
    ({ guildOwnershipService: ownership } = await import("../../src/modules/guilds/discord/ownership.js"));
    ({ moderationCaseService: cases } = await import("../../src/modules/moderation/discord/services.js"));
    ({ reportService: reports } = await import("../../src/modules/moderation/discord/services.js"));
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await db.transaction(async (tx) => {
        for (const guildId of guilds) {
          await tx.orm.public.CustomResponse.where({ guildId }).deleteAll();
          await tx.orm.public.MemberXp.where({ guildId }).deleteAll();
          await tx.orm.public.MemberReport.where({ guildId }).deleteAll();
          await tx.orm.public.ReportCounter.where({ guildId }).deleteAll();
          await tx.orm.public.ModerationCase.where({ guildId }).deleteAll();
          await tx.orm.public.ModerationCaseCounter.where({ guildId }).deleteAll();
          await tx.orm.public.GuildOwnership.where({ guildId }).deleteAll();
          await tx.orm.public.GuildConfig.where({ guildId }).deleteAll();
        }
      });
    } finally {
      await testApplication?.stop();
      await db.close();
    }
  });

  test("settings and identically named custom rules stay isolated between servers", async () => {
    await config.update(guildA, { welcomeMessage: "Server A", xpEnabled: false });
    await config.update(guildB, { welcomeMessage: "Server B", xpEnabled: false });
    expect((await config.getOrCreate(guildA)).welcomeMessage).toBe("Server A");
    expect((await config.getOrCreate(guildB)).welcomeMessage).toBe("Server B");
    await Promise.all([custom.create(rule(guildA, "hello")), custom.create(rule(guildB, "hello"))]);
    await custom.setResponse(guildA, "hello", "Only server A changed");
    expect((await custom.find(guildA, "hello"))?.response).toBe("Only server A changed");
    expect((await custom.find(guildB, "hello"))?.response).toBe("Integration response");
    await custom.remove(guildA, "hello");
    expect(await custom.find(guildA, "hello")).toBeNull();
    expect(await custom.find(guildB, "hello")).not.toBeNull();
  });

  test("concurrent custom creations cannot claim the same command trigger", async () => {
    const results = await Promise.allSettled([
      custom.create(rule(duplicateGuild, "first", "shared")),
      custom.create(rule(duplicateGuild, "second", "shared")),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason.message).toContain("trigger is already in use");
    expect(await custom.list(duplicateGuild)).toHaveLength(1);
  });

  test("concurrent creations enforce the 25-rule server limit", async () => {
    await Promise.all(Array.from({ length: 24 }, (_, index) => custom.create(rule(limitGuild, `rule-${index}`))));
    const results = await Promise.allSettled([
      custom.create(rule(limitGuild, "last-one")),
      custom.create(rule(limitGuild, "last-two")),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason.message).toContain("at most 25");
    expect(await custom.list(limitGuild)).toHaveLength(25);
  }, 15_000);

  test("XP awards survive concurrent activity and sharing requires mutual opt-in", async () => {
    const userId = `${prefix}-member`;
    await config.update(guildA, { xpEnabled: true, xpMessageAmount: 15, xpSharing: "server" });
    await config.update(guildB, { xpEnabled: true, xpMessageAmount: 40, xpSharing: "server" });
    const results = await Promise.all(Array.from({ length: 5 }, () => xp.award(guildA, userId)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await xp.award(guildB, userId)).toBe(true);
    expect(await xp.totals(guildA, userId)).toEqual([{ userId, xp: 15 }]);
    expect(await xp.totals(guildB, userId)).toEqual([{ userId, xp: 40 }]);
    await config.update(guildA, { xpSharing: "selected", xpSharedGuildIds: guildB });
    expect(await xp.totals(guildA, userId)).toEqual([{ userId, xp: 15 }]);
    await config.update(guildB, { xpSharing: "selected", xpSharedGuildIds: guildA });
    expect(await xp.totals(guildA, userId)).toEqual([{ userId, xp: 55 }]);
    expect(await xp.totals(guildB, userId)).toEqual([{ userId, xp: 55 }]);
  });

  test("ownership verification remains local and a transfer invalidates authorization", async () => {
    let currentOwner = `${prefix}-owner`;
    const guild = {
      id: guildA,
      fetch: async () => ({ ownerId: currentOwner }),
    } as unknown as Guild;
    const other = { id: guildB, fetch: guild.fetch } as unknown as Guild;
    expect(await ownership.verify(guild, "someone-else")).toBe(false);
    expect(await ownership.verify(guild, currentOwner)).toBe(true);
    expect(await ownership.isVerified(guild)).toBe(true);
    expect(await ownership.isVerified(other)).toBe(false);
    currentOwner = `${prefix}-new-owner`;
    expect(await ownership.isVerified(guild)).toBe(false);
    expect(await ownership.verify(guild, currentOwner)).toBe(true);
    expect(await ownership.unverify(guild, currentOwner)).toBe(true);
    expect(await ownership.isVerified(guild)).toBe(false);
  });

  test("moderation case numbers are unique under concurrency and restart per server", async () => {
    const input = { targetUserId: `${prefix}-member`, moderatorUserId: `${prefix}-moderator`, action: "NOTE" as const, reason: "Integration test" };
    const created = await Promise.all(Array.from({ length: 5 }, () => cases.createCase({ ...input, guildId: moderationGuild })));
    expect(created.map((item) => item.caseNumber).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    const other = await cases.createCase({ ...input, guildId: guildB });
    expect(other.caseNumber).toBe(1);
    expect(await cases.findByCaseNumber(guildA, 1)).toBeNull();
  });

  test("report review is atomic and preserves the first decision", async () => {
    const created = await reports.createReport({ guildId: reportGuild, reportedUserId: `${prefix}-member`, reporterUserId: `${prefix}-reporter`, reason: "Integration test" });
    const first = await reports.updateStatus({ guildId: reportGuild, reportNumber: created.reportNumber, status: "ACCEPTED", reviewedBy: "first" });
    expect(first?.status).toBe("ACCEPTED");
    expect(await reports.updateStatus({ guildId: reportGuild, reportNumber: created.reportNumber, status: "REJECTED", reviewedBy: "second" })).toBeNull();
    expect((await reports.findByReportNumber(reportGuild, created.reportNumber))?.reviewedBy).toBe("first");
  });
});
