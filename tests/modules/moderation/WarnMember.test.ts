import { expect, test, vi } from "vitest";
import { WarnMember, type WarningRepository } from "../../../src/modules/moderation/application/WarnMember.js";

test("warning policy uses an injected repository without Discord or a database", async () => {
  const created = vi.fn().mockResolvedValue({ caseNumber: 7 });
  const repository = {
    countWarningsForUser: vi.fn().mockResolvedValue(6),
    createCase: created,
  } as unknown as WarningRepository;
  const warn = new WarnMember(repository);
  const warningCount = await warn.nextWarningCount("guild", "member");
  expect(warningCount).toBe(7);
  await warn.record({ guildId: "guild", targetUserId: "member", moderatorUserId: "mod", reason: "reason", durationMs: null, warningCount, warningRoleId: "role", originGuildId: "origin" });
  expect(created).toHaveBeenCalledWith({
    guildId: "guild", targetUserId: "member", moderatorUserId: "mod", reason: "reason", durationMs: null,
    action: "WARNING", isGlobal: true,
    metadata: { warningRoleId: "role", warningCount: 7, originGuildId: "origin" },
  });
});
