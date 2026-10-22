import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadStartupEnvironment } from "../src/bootstrap/environment.js";
const mode = process.argv[2];
if (!["dev", "build", "start"].includes(mode ?? "")) throw new Error("Use dev, build or start");
loadStartupEnvironment(process.argv.slice(3));
const child = spawn(
  process.execPath,
  [
    fileURLToPath(new URL("../dashboard/node_modules/next/dist/bin/next", import.meta.url)),
    mode!,
    ...(mode === "start" ? [] : ["--webpack"]),
  ],
  {
    cwd: fileURLToPath(new URL("../dashboard/", import.meta.url)),
    env: process.env,
    stdio: "inherit",
  },
);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
child.on("error", () => {
  console.error("Dashboard launch failed. Install dashboard dependencies first.");
  process.exitCode = 1;
});
