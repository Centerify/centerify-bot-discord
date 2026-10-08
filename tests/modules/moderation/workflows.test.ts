import { expect, test, vi } from "vitest";
import { GlobalModeration, WarnMember, type WarningCase, type WarningRepository } from "../../../src/modules/moderation/index.js";
import type { GuildConfigStore } from "../../../src/modules/guilds/index.js";
const warning: WarningCase = { id: 1, caseNumber: 1, guildId: "guild", targetUserId: "member", moderatorUserId: "mod", action: "WARNING", reason: "reason", durationMs: null, isGlobal: false, metadata: {}, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
const input = { guildId: "guild", targetUserId: "member", moderatorUserId: "mod", reason: "reason", durationMs: null };

test("warning workflow orders count, role preparation, audit and assignment without a Discord client", async () => {
  const calls: string[] = [];
  const repository: WarningRepository = {
    async countWarningsForUser() { calls.push("count"); return 2; },
    async createCase(value) { calls.push("audit"); expect(value.metadata.warningCount).toBe(3); return warning; },
  };
  const result = await new WarnMember(repository).execute(input, {
    async prepareRole(id, count) { calls.push("prepare"); expect([id, count]).toEqual(["guild", 3]); return { id: "role", name: "warn3", error: null }; },
    async assignRole(id, role) { calls.push("assign"); expect([id, role]).toEqual(["guild", "role"]); },
  });
  expect(result).toEqual({ status: "created", roleName: "warn3", moderationCase: warning });
  expect(calls).toEqual(["count", "prepare", "audit", "assign"]);
});

test("a rejected role does not create an audit case or assign a role", async () => {
  const createCase = vi.fn().mockResolvedValue(warning), assignRole = vi.fn();
  const warn = new WarnMember({ countWarningsForUser: async () => 0, createCase });
  expect(await warn.execute(input, { prepareRole: async () => ({ id: "role", name: "warn1", error: "hierarchy" }), assignRole })).toEqual({ status: "rejected", roleName: "warn1", reason: "hierarchy" });
  expect(createCase).not.toHaveBeenCalled();
  expect(assignRole).not.toHaveBeenCalled();
});

test("global moderation continues after unavailable servers and records partial outcomes", async () => {
  const config: GuildConfigStore = { getOrCreate: vi.fn(), update: vi.fn(), globalModerationGuildIds: vi.fn() };
  const warn = vi.fn();
  const service = new GlobalModeration(config, { info() {}, error() {}, warn });
  const result = await service.apply({ guildIds: ["ok", "unavailable", "failed", "also-ok"], targetUserId: "member", action: "warn" }, async (id) => {
    if (id === "unavailable") return null;
    if (id === "failed") throw new Error("storage unavailable");
    return { ...warning, guildId: id };
  });
  expect(result.cases.map((entry) => entry.guildId)).toEqual(["ok", "also-ok"]);
  expect(result.skippedGuildIds).toEqual(["unavailable", "failed"]);
  expect(warn).toHaveBeenCalledOnce();
});
