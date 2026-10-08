import assert from "node:assert/strict";
import { test } from "vitest";
import { parseSharedGuildIds, sharedXpGuildIds, xpProgress, earningRule, XP_METHOD_CHOICES, type XpConfig } from "../../src/modules/xp/domain/policy.js";
const source: XpConfig = { guildId: "a", xpEnabled: true, xpSharing: "server", xpSharedGuildIds: "b,c" };
const target: XpConfig = { guildId: "b", xpEnabled: true, xpSharing: "selected", xpSharedGuildIds: "a" };

test("server-only and disabled XP do not import other servers", () => {
  assert.deepEqual(sharedXpGuildIds(source, [target]), ["a"]);
  assert.deepEqual(sharedXpGuildIds({ ...source, xpEnabled: false, xpSharing: "selected" }, [target]), ["a"]);
});
test("global XP requires enabled global opt-in", () => {
  const global = { ...source, xpSharing: "global" };
  assert.deepEqual(sharedXpGuildIds(global, [target, { ...target, guildId: "c", xpSharing: "global" },
    { ...target, guildId: "d", xpSharing: "global", xpEnabled: false }]), ["a", "c"]);
});
test("selected XP requires mutual direct selection and excludes disabled servers", () => {
  const selected = { ...source, xpSharing: "selected" };
  assert.deepEqual(sharedXpGuildIds(selected, [target, { ...target, guildId: "c", xpSharedGuildIds: "b" },
    { ...target, guildId: "d" }]), ["a", "b"]);
  assert.deepEqual(sharedXpGuildIds(selected, [{ ...target, xpEnabled: false }]), ["a"]);
});
test("server selection validates, deduplicates, and clears IDs", () => {
  assert.deepEqual(parseSharedGuildIds("123456789012345678, 123456789012345678"), ["123456789012345678"]);
  assert.deepEqual(parseSharedGuildIds("clear"), []);
  for (const value of ["", "123", "123456789012345678,", "abc"]) assert.throws(() => parseSharedGuildIds(value));
  assert.throws(() => parseSharedGuildIds(Array.from({ length: 26 }, (_, i) => String(123456789012345678n + BigInt(i))).join(",")));
});
test("level progress is correct at thresholds", () => {
  assert.deepEqual(xpProgress(0), { level: 0, progress: 0, required: 100 });
  assert.deepEqual(xpProgress(99), { level: 0, progress: 99, required: 100 });
  assert.deepEqual(xpProgress(100), { level: 1, progress: 0, required: 300 });
  assert.deepEqual(xpProgress(415), { level: 2, progress: 15, required: 500 });
});


test("every earning choice activates exactly its selected methods", () => {
  const base = { xpEnabled: true, xpMethods: "messages", xpMessageAmount: 20, xpReactionAmount: 10, xpDailyAmount: 200, xpCooldownSeconds: 90 };
  for (const choice of XP_METHOD_CHOICES) {
    for (const method of ["messages", "reactions", "daily"] as const) {
      const rule = earningRule({ ...base, xpMethods: choice.value }, method);
      assert.equal(rule !== null, choice.value.split(",").includes(method));
      if (rule) assert.equal(rule.cooldownSeconds, method === "daily" ? 86400 : 90);
    }
  }
  assert.deepEqual(earningRule(base, "messages"), { amount: 20, cooldownSeconds: 90 });
  assert.equal(earningRule({ ...base, xpEnabled: false }, "messages"), null);
  assert.equal(earningRule({ ...base, xpMessageAmount: -1 }, "messages"), null);
});
