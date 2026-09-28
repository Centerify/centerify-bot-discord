import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ first: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn(), where: vi.fn() }));
vi.mock("../../src/prisma/db.js", () => ({ db: { orm: { public: { GuildConfig: {
  where: mocks.where, create: mocks.create, upsert: mocks.upsert,
} } } } }));
import { GuildConfigService } from "../../src/services/guildConfigService.js";
const service = new GuildConfigService();
const config = { id: 1, guildId: "server", xpEnabled: true };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.where.mockReturnValue({ first: mocks.first, update: mocks.update });
});

test("settings upsert explicitly targets guildId rather than the generated primary key", async () => {
  mocks.upsert.mockResolvedValue(config);
  expect(await service.update("server", { xpEnabled: true })).toBe(config);
  expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
    conflictOn: { guildId: "server" },
    create: expect.objectContaining({ guildId: "server", xpEnabled: true }),
    update: { xpEnabled: true },
  }));
  expect(mocks.update).not.toHaveBeenCalled();
});

for (const constraint of ["guild_config_guildId_key", "guildConfig_guildId_key"]) {
  test(`concurrent settings creation recovers from ${constraint}`, async () => {
    mocks.first.mockResolvedValueOnce(null).mockResolvedValueOnce(config);
    mocks.create.mockRejectedValue({ sqlState: "23505", constraint });
    expect(await service.getOrCreate("server")).toBe(config);
    expect(mocks.where).toHaveBeenCalledWith({ guildId: "server" });
  });

  test(`settings update fallback handles ${constraint}`, async () => {
    mocks.upsert.mockRejectedValue({ sqlState: "23505", constraint });
    mocks.first.mockResolvedValue(config);
    expect(await service.update("server", { xpEnabled: true })).toBe(config);
    expect(mocks.update).toHaveBeenCalledWith({ xpEnabled: true });
    expect(mocks.where).toHaveBeenCalledWith({ guildId: "server" });
  });
}

test("unrelated database failures are propagated without changing settings", async () => {
  const error = { sqlState: "23505", constraint: "another_unique_key" };
  mocks.upsert.mockRejectedValue(error);
  await expect(service.update("server", { xpEnabled: true })).rejects.toBe(error);
  expect(mocks.update).not.toHaveBeenCalled();
});
