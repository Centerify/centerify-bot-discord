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
    transaction: (fn: (tx: unknown) => unknown) => fn({ query: mocks.query }),
  } };
});
import { XpService } from "../../src/modules/xp/index.js";
import { PrismaXpRepository } from "../../src/modules/xp/infrastructure/PrismaXpRepository.js";
const xpService = new XpService(new PrismaXpRepository(), { getOrCreate: mocks.config });

beforeEach(() => { vi.clearAllMocks(); });

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
