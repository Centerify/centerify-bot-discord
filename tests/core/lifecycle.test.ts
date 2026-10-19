import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";

function subprocess(mode: "signal" | "error" | "timeout" | "second-signal") {
  const source = `
    import { installShutdown } from './src/bootstrap/lifecycle.ts';
    const mode = ${JSON.stringify(mode)};
    const logger = Object.fromEntries(['info', 'warn', 'error'].map(level => [level, (fields, message) => console.log(JSON.stringify({level, message}))]));
    installShutdown({ async stop() {
      console.log('cleanup-started');
      if (mode === 'timeout' || mode === 'second-signal') await new Promise(() => {});
      console.log('cleanup-completed');
    } }, logger, 100);
    if (mode === 'error') process.emit('unhandledRejection', new Error('synthetic-fatal-error'));
    else process.emit('SIGTERM', 'SIGTERM');
    if (mode === 'second-signal') setImmediate(() => process.emit('SIGTERM', 'SIGTERM'));
  `;
  return spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", source], {
    encoding: "utf8",
    timeout: 10_000,
  });
}
test("actual shutdown package completes bot cleanup before a clean signal exit", () => {
  const result = subprocess("signal");
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("cleanup-completed");
});
test("fatal errors clean up and exit unsuccessfully instead of continuing the bot", () => {
  const result = subprocess("error");
  expect(result.status).toBe(1);
  expect(result.stdout).toContain("cleanup-completed");
  expect(result.stdout).toContain("fatal error");
});
test.each(["timeout", "second-signal"] as const)("%s cannot leave shutdown hanging", (mode) => {
  const result = subprocess(mode);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stdout.match(/cleanup-started/g)).toHaveLength(1);
  expect(result.stdout).not.toContain("cleanup-completed");
  expect(result.stdout).toContain(
    mode === "timeout" ? "deadline exceeded" : "Second shutdown signal",
  );
});
