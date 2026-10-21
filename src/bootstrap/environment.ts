import { config as dotenv } from "dotenv";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadConfiguration } from "../configuration.js";

/** Shared by the executable and offline checker; shell variables always win. */
export function loadStartupEnvironment(
  args = process.argv.slice(2),
  env = process.env,
  cwd = process.cwd(),
) {
  const { values } = parseArgs({
    args,
    options: {
      config: { type: "string" },
      "env-file": { type: "string" },
    },
  });
  if (values.config) env.CENTERIFY_CONFIG = values.config;
  const file = loadConfiguration(env, cwd);
  const selected = values["env-file"] ?? env.CENTERIFY_ENV_FILE ?? file.envFile;
  const result = dotenv({ path: resolve(cwd, selected ?? ".env"), processEnv: env, quiet: true });
  if (result.error && selected)
    throw new Error("Cannot read selected environment file. Check envFile or --env-file.");
  return env;
}
