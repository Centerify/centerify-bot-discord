import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import {
  BridgeVerifier,
  signature,
  requireCapability,
  recoveryEvents,
} from "../../../src/dashboard/security.js";
const secret = "test-only-dashboard-bridge-secret-at-least-32-characters",
  actor = "111111111111111111",
  now = 1800000000000;
function headers(
  path = "/v1/guilds/222222222222222222/settings",
  body = "{}",
  nonce = randomUUID(),
  timestamp = String(now),
) {
  return {
    "x-centerify-time": timestamp,
    "x-centerify-nonce": nonce,
    "x-centerify-actor": actor,
    "x-centerify-signature": signature(secret, timestamp, nonce, actor, "POST", path, body),
  };
}
test("signed requests bind actor, body, method and guild path", () => {
  const verifier = new BridgeVerifier(secret, () => now),
    path = "/v1/guilds/222222222222222222/settings";
  expect(verifier.verify(headers(), "POST", path, "{}")).toBe(actor);
  expect(() => verifier.verify(headers(), "POST", path, '{"changed":true}')).toThrow(
    "authentication",
  );
  expect(() => verifier.verify(headers(), "GET", path, "{}")).toThrow("authentication");
  expect(() =>
    verifier.verify(
      headers(),
      "POST",
      path.replace("222222222222222222", "333333333333333333"),
      "{}",
    ),
  ).toThrow("authentication");
  const forged = headers();
  forged["x-centerify-actor"] = "333333333333333333";
  expect(() => verifier.verify(forged, "POST", path, "{}")).toThrow("authentication");
});
test("bridge rejects replay, stale requests and malformed signatures", () => {
  const verifier = new BridgeVerifier(secret, () => now),
    path = "/v1/guilds/222222222222222222/settings",
    signed = headers();
  verifier.verify(signed, "POST", path, "{}");
  expect(() => verifier.verify(signed, "POST", path, "{}")).toThrow();
  expect(() =>
    verifier.verify(headers(path, "{}", randomUUID(), String(now - 31000)), "POST", path, "{}"),
  ).toThrow();
  expect(() =>
    verifier.verify({ ...headers(), "x-centerify-signature": "not-a-mac" }, "POST", path, "{}"),
  ).toThrow();
  expect(() => new BridgeVerifier("weak")).toThrow();
});
test("guild capabilities fail closed", () => {
  expect(() => requireCapability(["overview", "tickets"], "moderation")).toThrow(
    "requires moderation",
  );
  expect(() => requireCapability(["settings"], "settings")).not.toThrow();
});
test("event recovery drops duplicates and signals expired history", () => {
  const rows = [{ id: 5 }, { id: 6 }, { id: 7 }];
  expect(recoveryEvents(rows, 6, 5)).toEqual({ reset: false, events: [{ id: 7 }] });
  expect(recoveryEvents(rows, 2, 5).reset).toBe(true);
  expect(recoveryEvents(rows, 0, 5).reset).toBe(false);
});
