import { describe, expect, it } from "vitest";
import { toAuditLogReason } from "../../../src/services/moderation/commandUtils.js";

describe("toAuditLogReason", () => {
  it("trims short audit-log reasons", () => {
    expect(toAuditLogReason("  routine action  ")).toBe("routine action");
  });

  it("limits audit-log reasons to Discord's 512-character maximum", () => {
    const reason = "a".repeat(1_000);
    const result = toAuditLogReason(reason);

    expect(result).toHaveLength(512);
    expect(result.endsWith("...")).toBe(true);
  });
});
