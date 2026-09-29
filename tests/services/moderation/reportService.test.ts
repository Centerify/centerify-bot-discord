import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ where: vi.fn(), update: vi.fn() }));
vi.mock("../../../src/prisma/db.js", () => ({ db: { orm: { public: { MemberReport: { where: mocks.where } } } } }));
import { reportService } from "../../../src/services/moderation/reportService.js";
beforeEach(() => { vi.resetAllMocks(); mocks.where.mockReturnValue({ update: mocks.update }); });
test("report decisions only update a still-pending report", async () => {
  const report = { status: "ACCEPTED", reviewedBy: "mod" };
  mocks.update.mockResolvedValue(report);
  expect(await reportService.updateStatus({ guildId: "guild", reportNumber: 1, status: "ACCEPTED", reviewedBy: "mod" })).toBe(report);
  expect(mocks.where).toHaveBeenCalledWith({ guildId: "guild", reportNumber: 1, status: "PENDING" });
});
test("a concurrent second decision cannot overwrite the first reviewer", async () => {
  mocks.update.mockResolvedValue(null);
  expect(await reportService.updateStatus({ guildId: "guild", reportNumber: 1, status: "REJECTED", reviewedBy: "other" })).toBeNull();
});
