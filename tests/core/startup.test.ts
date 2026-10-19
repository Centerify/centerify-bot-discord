import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";

function run(file: string, env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ["--import", "tsx", file], {
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 10_000,
  });
}
test("the executable rejects missing credentials with safe diagnostics before starting Discord", () => {
  const result = run("src/index.ts", {
    DISCORD_TOKEN: "",
    DATABASE_URL: "synthetic-private-connection",
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("DISCORD_TOKEN");
  expect(result.stderr).toContain("DATABASE_URL");
  expect(result.stderr).not.toContain("synthetic-private-connection");
});
test("the configuration check succeeds without a database or Discord connection and never prints credentials", () => {
  const result = run("scripts/check-config.ts", {
    DISCORD_TOKEN: "synthetic-private-token",
    DATABASE_URL: "postgresql://user:synthetic-private-password@localhost/centerify",
    NODE_ENV: "production",
    LOG_FORMAT: "json",
    LOG_LEVEL: "warn",
    CENTERIFY_MODULES: '{"xp":false}',
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Configuration is valid");
  expect(result.stdout).toContain("json/warn");
  expect(result.stdout).toContain("xp");
  expect(result.stdout).not.toContain("synthetic-private");
});
