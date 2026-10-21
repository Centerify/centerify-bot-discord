import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// This fixed project-relative target cannot depend on user configuration.
await rm(new URL("../dist/", import.meta.url), { recursive: true, force: true });
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url)),
    "-p",
    "tsconfig.build.json",
  ],
  {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    stdio: "inherit",
  },
);
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
