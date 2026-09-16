import assert from "node:assert/strict";
import { test } from "vitest";
import { formatDetailedCaseField } from "../../../src/services/moderation/renderer.js";

const warning = {
  caseNumber: 42,
  targetUserId: "target",
  moderatorUserId: "moderator",
  action: "WARNING",
  reason: "Repeated spam",
  durationMs: 60_000,
  createdAt: "2026-09-15T12:00:00.000Z",
};

test("history details show when an active warning role will be removed", () => {
  const field = formatDetailedCaseField(
    warning,
    new Date("2026-09-15T12:00:30.000Z"),
  );

  assert.match(field.name, /Warning • Active/);
  assert.match(field.value, /Role removal/);
  assert.match(field.value, /<t:1789473660:R>/);
  assert.match(field.value, /counts until then/);
});

test("history details identify expired warnings as no longer counted", () => {
  const field = formatDetailedCaseField(
    warning,
    new Date("2026-09-15T12:02:00.000Z"),
  );

  assert.match(field.name, /Warning • Expired/);
  assert.match(field.value, /no longer counts/);
});

test("history details include warning revocation attribution and reason", () => {
  const field = formatDetailedCaseField({
    ...warning,
    durationMs: null,
    metadata: {
      warningRevokedAt: "2026-09-15T12:00:30.000Z",
      warningRevokedBy: "moderator-two",
      warningRevocationReason: "Appeal accepted",
    },
  });

  assert.match(field.name, /Warning • Revoked/);
  assert.match(field.value, /<@moderator-two>/);
  assert.match(field.value, /Appeal accepted/);
  assert.match(field.value, /no longer counts/);
});
