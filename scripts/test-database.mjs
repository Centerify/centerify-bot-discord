import "dotenv/config";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const e2eOnly = process.argv.includes("--e2e");
const databaseUrl =
  process.env.TEST_DATABASE_URL ||
  (!e2eOnly ? process.env.DATABASE_URL : undefined);
if (!databaseUrl) {
  console.error(
    e2eOnly
      ? "Set TEST_DATABASE_URL to a migrated development PostgreSQL database."
      : "Set TEST_DATABASE_URL or DATABASE_URL to a migrated development PostgreSQL database.",
  );
  process.exit(1);
}

console.log(
  "Running live database tests with temporary synthetic server records.",
);
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(
      new URL("../node_modules/vitest/vitest.mjs", import.meta.url),
    ),
    "run",
    e2eOnly
      ? "tests/integration/customCommandSharing.e2e.test.ts"
      : "tests/integration/",
  ],
  {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: {
      ...process.env,
      TEST_DATABASE_URL: databaseUrl,
      XDG_DATA_HOME: ".cache",
    },
    stdio: "inherit",
  },
);
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
