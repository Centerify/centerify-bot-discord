import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: vi.fn(), query: vi.fn(), all: vi.fn(), aggregate: vi.fn(),
}));
vi.mock("../../src/modules/guilds/discord/config.js", () => ({ guildConfigService: { getOrCreate: mocks.config } }));
vi.mock("../../src/adapters/prisma/client.js", () => {
  const members = {
    where: vi.fn(() => members),
    groupBy: vi.fn(() => ({ aggregate: mocks.aggregate })),
  };
  return { db: {
    orm: { public: {
      GuildConfig: { where: () => ({ all: mocks.all }) },
      MemberXp: members,
    } },
    raw: { sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      returnsRow: () => ({ build: () => ({ sql: strings.join("?"), values }) }),
    }) },
    runtime: () => ({ query: mocks.query }),
  } };
});
import { XpService } from "../../src/modules/xp/index.js";
import { PrismaXpRepository } from "../../src/modules/xp/infrastructure/PrismaXpRepository.js";
import type { GuildConfig } from "../../src/modules/guilds/index.js";
let xpService: XpService;

beforeEach(() => {
  vi.resetAllMocks();
  xpService = new XpService(new PrismaXpRepository(), { getOrCreate: mocks.config });
});

test("disabled servers do not write XP", async () => {
  mocks.config.mockResolvedValue({ xpEnabled: false });
  expect(await xpService.award("server", "member")).toBe(false);
  expect(mocks.query).not.toHaveBeenCalled();
});

test("awards use a parameterized database increment and persisted cooldown", async () => {
  mocks.config.mockResolvedValue({ xpEnabled: true, xpMethods: "messages,reactions,daily", xpMessageAmount: 15, xpReactionAmount: 5, xpDailyAmount: 100, xpCooldownSeconds: 60 });
  mocks.query.mockResolvedValue([{ xp: 15 }]);
  expect(await xpService.award("server", "member")).toBe(true);
  const plan = mocks.query.mock.calls[0][0];
  expect(plan.values.slice(0, 3)).toEqual(["server", "member", 15]);
  expect(plan.values.at(-1)).toBe(60);
  expect(plan.sql).toContain('ON CONFLICT ("guildId", "userId") DO UPDATE');
  expect(plan.sql).toContain('member_xp.xp + ?');
  expect(plan.sql).toContain("interval '1 second'");
  mocks.query.mockResolvedValue([]);
  expect(await xpService.award("server", "member")).toBe(false);
});

test("totals sort XP with deterministic ties and normalize empty aggregates", async () => {
  mocks.config.mockResolvedValue({ guildId: "a", xpEnabled: true, xpSharing: "server", xpSharedGuildIds: "" });
  mocks.aggregate.mockResolvedValue([{ userId: "b", xp: 15 }, { userId: "c", xp: null }, { userId: "a", xp: 15 }]);
  expect(await xpService.totals("a")).toEqual([{ userId: "a", xp: 15 }, { userId: "b", xp: 15 }, { userId: "c", xp: 0 }]);
  expect(mocks.all).not.toHaveBeenCalled();
});


test("unselected earning methods never write XP", async () => {
  mocks.config.mockResolvedValue({ xpEnabled: true, xpMethods: "messages" });
  expect(await xpService.earn("server", "member", "daily")).toEqual({ status: "disabled", amount: 0 });
  expect(await xpService.award("server", "member", "reactions")).toBe(false);
  expect(mocks.query).not.toHaveBeenCalled();
});

test("daily rewards use the configured amount and fixed independent 24-hour cooldown", async () => {
  mocks.config.mockResolvedValue({ xpEnabled: true, xpMethods: "messages,daily", xpMessageAmount: 15, xpReactionAmount: 5, xpDailyAmount: 250, xpCooldownSeconds: 30 });
  mocks.query.mockResolvedValue([{ xp: 250 }]);
  expect(await xpService.earn("server", "member", "daily")).toEqual({ status: "awarded", amount: 250 });
  const plan = mocks.query.mock.calls[0][0];
  expect(plan.values.slice(0, 3)).toEqual(["server", "member", 250]);
  expect(plan.values.at(-1)).toBe(86400);
  expect(plan.sql).toContain(`WHEN 'daily' THEN member_xp."lastDailyAwardedAt"`);
  mocks.query.mockResolvedValue([]);
  expect(await xpService.earn("server", "member", "daily")).toEqual({ status: "cooldown", amount: 250 });
});

function earningFixture(maxEntries = 100_000) {
  let now = 0;
  const settings = {
    xpEnabled: true, xpMethods: "messages,reactions,daily", xpMessageAmount: 15,
    xpReactionAmount: 5, xpDailyAmount: 250, xpCooldownSeconds: 60,
  } as GuildConfig;
  mocks.config.mockImplementation(async () => settings);
  const award = vi.fn().mockResolvedValue(true);
  const service = new XpService({ award, sharingConfigurations: vi.fn(), totals: vi.fn() },
    { getOrCreate: mocks.config }, () => now, maxEntries);
  return { service, award, settings, setTime(value: number) { now = value; } };
}

test("a burst of 1,000 concurrent events writes and awards only once", async () => {
  const { service, award } = earningFixture();
  const results = await Promise.all(Array.from({ length: 1000 }, () => service.award("guild", "user")));
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(award).toHaveBeenCalledOnce();
});

test("known cooldowns suppress repeated writes until the exact expiry", async () => {
  const { service, award, setTime } = earningFixture();
  expect(await service.award("guild", "user")).toBe(true);
  for (let i = 0; i < 1000; i++) expect(await service.award("guild", "user")).toBe(false);
  setTime(59_999);
  expect(await service.award("guild", "user")).toBe(false);
  expect(award).toHaveBeenCalledOnce();
  setTime(60_000);
  expect(await service.award("guild", "user")).toBe(true);
  expect(award).toHaveBeenCalledTimes(2);
});

test("guilds, users and earning methods have independent cooldowns", async () => {
  const { service, award, setTime } = earningFixture();
  expect(await service.award("a", "user")).toBe(true);
  expect(await service.award("b", "user")).toBe(true);
  expect(await service.award("a", "other")).toBe(true);
  expect(await service.award("a", "user", "reactions")).toBe(true);
  expect(await service.award("a", "user", "daily")).toBe(true);
  expect(award).toHaveBeenCalledTimes(5);
  setTime(60_000);
  expect(await service.award("a", "user")).toBe(true);
  expect(await service.award("a", "user", "daily")).toBe(false);
  setTime(86_400_000);
  expect(await service.award("a", "user", "daily")).toBe(true);
});

test("settings changes apply immediately during a known cooldown", async () => {
  const { service, award, settings, setTime } = earningFixture();
  await service.award("guild", "user");
  settings.xpEnabled = false;
  expect(await service.earn("guild", "user", "messages")).toEqual({ status: "disabled", amount: 0 });
  settings.xpEnabled = true;
  settings.xpMessageAmount = 40;
  expect(await service.earn("guild", "user", "messages")).toEqual({ status: "cooldown", amount: 40 });
  settings.xpCooldownSeconds = 10;
  setTime(10_000);
  expect(await service.earn("guild", "user", "messages")).toEqual({ status: "awarded", amount: 40 });
  expect(award).toHaveBeenLastCalledWith("guild", "user", "messages", 40, 10);
});

test("failed and rejected awards never create local cooldowns", async () => {
  const { service, award } = earningFixture();
  award.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("offline"));
  expect(await service.award("guild", "user")).toBe(false);
  const failed = await Promise.allSettled(Array.from({ length: 5 }, () => service.award("guild", "user")));
  expect(failed.every((result) => result.status === "rejected")).toBe(true);
  expect(award).toHaveBeenCalledTimes(2);
  expect(await service.award("guild", "user")).toBe(true);
});

test("eviction delegates back to persisted cooldowns without affecting other entries", async () => {
  const { service, award } = earningFixture(2);
  for (const user of ["a", "b", "c"]) await service.award("guild", user);
  award.mockResolvedValue(false);
  expect(await service.award("guild", "a")).toBe(false);
  expect(award).toHaveBeenCalledTimes(4);
  expect(await service.award("guild", "b")).toBe(false);
  expect(await service.award("guild", "c")).toBe(false);
  expect(award).toHaveBeenCalledTimes(4);
});

test("slow writes do not extend the local cooldown beyond the database cooldown", async () => {
  const { service, award, setTime } = earningFixture();
  let finish!: (value: boolean) => void;
  award.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  const first = service.award("guild", "user");
  await vi.waitFor(() => expect(award).toHaveBeenCalledOnce());
  setTime(60_000);
  finish(true);
  expect(await first).toBe(true);
  expect(await service.award("guild", "user")).toBe(true);
  expect(award).toHaveBeenCalledTimes(2);
});

test("an expired pending write cannot suppress later events or clear a newer write", async () => {
  const { service, award, setTime } = earningFixture();
  let finishFirst!: (value: boolean) => void;
  let finishSecond!: (value: boolean) => void;
  award.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finishFirst = resolve; }))
    .mockImplementationOnce(() => new Promise<boolean>((resolve) => { finishSecond = resolve; }));
  const first = service.award("guild", "user");
  await vi.waitFor(() => expect(award).toHaveBeenCalledOnce());
  setTime(60_000);
  const second = service.award("guild", "user");
  await vi.waitFor(() => expect(award).toHaveBeenCalledTimes(2));
  finishFirst(false);
  expect(await first).toBe(false);
  const third = service.award("guild", "user");
  await Promise.resolve();
  finishSecond(true);
  expect(await second).toBe(true);
  expect(await third).toBe(false);
  expect(award).toHaveBeenCalledTimes(2);
});
