import { afterEach, expect, test, vi } from "vitest";
import { serializeError } from "../../src/adapters/logging/errors.js";

afterEach(() => vi.unstubAllEnvs());
test("REST error diagnostics preserve codes while excluding request and response secrets", () => {
  vi.stubEnv("DISCORD_TOKEN", "test-bot-secret");
  vi.stubEnv("DATABASE_URL", "postgresql://user:password@db/internal");
  const error = Object.assign(
    new Error(
      "test-bot-secret failed at https://discord.com/api/v10/webhooks/123/interaction-secret",
    ),
    {
      code: 10062,
      requestBody: { token: "another-secret" },
      rawError: { privateData: "private" },
      url: "https://discord.com/api/v10/interactions/123/another-token/callback",
    },
  );
  const result = serializeError(error);
  expect(result).toMatchObject({ type: "Error", code: 10062 });
  const json = JSON.stringify(result);
  for (const secret of [
    "test-bot-secret",
    "interaction-secret",
    "another-secret",
    "private",
    "another-token",
  ])
    expect(json).not.toContain(secret);
  expect(json).toContain("redacted");
});
test("token-bearing endpoint variants and database credentials are removed from stacks", () => {
  for (const url of [
    "https://discord.com/api/webhooks/123/secret",
    "https://canary.discord.com/api/v10/interactions/123/secret/callback",
    "https://discordapp.com/api/v9/webhooks/123/secret",
    "postgresql://user:secret@database/prod",
  ])
    expect(JSON.stringify(serializeError(new Error(url)))).not.toContain("secret");
});
test("primitive errors and arbitrary custom properties are never logged", () => {
  expect(serializeError("sensitive string")).toEqual({ type: "UnknownError" });
  expect(serializeError({ code: "secret", cause: { password: "secret" } })).toEqual({
    type: "Error",
  });
});

test("trimmed credentials used by validated configuration stay redacted", () => {
  vi.stubEnv("DISCORD_TOKEN", "  synthetic-trimmed-token  ");
  expect(JSON.stringify(serializeError(new Error("synthetic-trimmed-token")))).not.toContain(
    "synthetic-trimmed-token",
  );
});
