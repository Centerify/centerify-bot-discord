import assert from "node:assert/strict";
import { test } from "vitest";
import {
  getWarningExpiresAt,
  getWarningRevocation,
  hasWarningDurationEnded,
  isActiveWarning,
  warningRoleId,
} from "../../../src/services/moderation/warningLifecycle.js";

const timedWarning = {
  action: "WARNING",
  durationMs: 60_000,
  createdAt: "2026-09-15T12:00:00.000Z",
};

test("calculates when a timed warning expires", () => {
  assert.equal(
    getWarningExpiresAt(timedWarning)?.toISOString(),
    "2026-09-15T12:01:00.000Z",
  );
  assert.equal(
    hasWarningDurationEnded(timedWarning, new Date("2026-09-15T12:00:59.999Z")),
    false,
  );
  assert.equal(
    hasWarningDurationEnded(timedWarning, new Date("2026-09-15T12:01:00.000Z")),
    true,
  );
});

test("expired timed warnings stop counting while permanent warnings remain active", () => {
  const afterExpiry = new Date("2026-09-15T12:02:00.000Z");
  const permanentWarning = { ...timedWarning, durationMs: null };

  assert.equal(isActiveWarning(timedWarning, afterExpiry), false);
  assert.equal(isActiveWarning(permanentWarning, afterExpiry), true);
  assert.equal(
    isActiveWarning({ ...permanentWarning, action: "NOTE" }, afterExpiry),
    false,
  );
});

test("revoked warnings stop counting even when they were permanent", () => {
  const revokedWarning = {
    ...timedWarning,
    durationMs: null,
    metadata: {
      warningRevokedAt: "2026-09-15T12:00:30.000Z",
      warningRevokedBy: "moderator",
      warningRevocationReason: "Issued by mistake",
    },
  };

  assert.equal(isActiveWarning(revokedWarning), false);
  assert.deepEqual(getWarningRevocation(revokedWarning.metadata), {
    revokedAt: "2026-09-15T12:00:30.000Z",
    revokedBy: "moderator",
    revocationReason: "Issued by mistake",
  });
});

test("reads warning role ids only from valid metadata", () => {
  assert.equal(warningRoleId({ warningRoleId: "123" }), "123");
  assert.equal(warningRoleId({ warningRoleId: 123 }), null);
  assert.equal(warningRoleId(null), null);
});
