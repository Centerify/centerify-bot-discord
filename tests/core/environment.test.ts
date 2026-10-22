import { expect, test } from "vitest";
import { parseEnvironment, EnvironmentConfigurationError } from "../../src/bootstrap/config.js";
import { parseLoggingConfiguration } from "../../src/adapters/logging/config.js";

const valid = {
  DISCORD_TOKEN: "synthetic-token",
  DATABASE_URL: "postgresql://user:synthetic-password@localhost/centerify",
};
test("typed defaults and optional module settings are easy to override", () => {
  const config = parseEnvironment(valid);
  expect(config.shutdownTimeoutMs).toBe(10_000);
  expect(config.logging).toEqual({ level: "info", format: "pretty" });
  expect(config.modules).toEqual({});
  expect(
    parseEnvironment({
      ...valid,
      NODE_ENV: "production",
      SHUTDOWN_TIMEOUT_MS: "30000",
      LOG_LEVEL: "warn",
      CENTERIFY_MODULES: '{"xp":false}',
    }),
  ).toMatchObject({
    shutdownTimeoutMs: 30_000,
    logging: { level: "warn", format: "json" },
    modules: { xp: { enabled: false } },
  });
});
test.each([
  {},
  { ...valid, DISCORD_TOKEN: " " },
  { ...valid, DATABASE_URL: "https://example.com/db" },
  { ...valid, DATABASE_URL: "postgresql://localhost" },
  { ...valid, SHUTDOWN_TIMEOUT_MS: "NaN" },
  { ...valid, SHUTDOWN_TIMEOUT_MS: "0" },
  { ...valid, SHUTDOWN_TIMEOUT_MS: "120001" },
  { ...valid, CENTERIFY_HEALTH_PORT: "0" },
  { ...valid, CENTERIFY_HEALTH_PORT: "65536" },
  { ...valid, CENTERIFY_HEALTH_PORT: "NaN" },
])("invalid configuration fails before acquiring runtime resources: %j", (input) => {
  expect(() => parseEnvironment(input)).toThrow(EnvironmentConfigurationError);
});
test("startup diagnostics never echo submitted credentials or malformed JSON", () => {
  for (const patch of [
    { DATABASE_URL: "synthetic-private-url" },
    { CENTERIFY_MODULES: '{"secret":"synthetic-private-config"' },
  ]) {
    try {
      parseEnvironment({ ...valid, ...patch });
      throw new Error("must reject");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentConfigurationError);
      expect(String(error)).not.toContain("synthetic-private");
      expect(String(error)).not.toContain("synthetic-token");
    }
  }
});
test.each(["[]", '{"xp":"false"}', '{"__proto__":true}', '{"xp":{"unknown":true}}'])(
  "malformed module options fail closed: %s",
  (CENTERIFY_MODULES) => {
    expect(() => parseEnvironment({ ...valid, CENTERIFY_MODULES })).toThrow("CENTERIFY_MODULES");
  },
);
test.each([{ LOG_LEVEL: "verbose" }, { LOG_FORMAT: "xml" }, { NODE_ENV: "unknown" }])(
  "invalid logging options are rejected without exposing values",
  (env) => {
    expect(() => parseLoggingConfiguration(env)).toThrow("Invalid logging configuration");
  },
);
test("operators can request JSON logs in development or pretty logs with dev dependencies installed", () => {
  expect(parseLoggingConfiguration({ LOG_FORMAT: "json" }).format).toBe("json");
  expect(parseLoggingConfiguration({ NODE_ENV: "production", LOG_FORMAT: "pretty" }).format).toBe(
    "pretty",
  );
});
