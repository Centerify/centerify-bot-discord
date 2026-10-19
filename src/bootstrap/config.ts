import { z } from "zod";
import { parseModuleConfiguration } from "../core/index.js";
import { parseLoggingConfiguration } from "../adapters/logging/config.js";

export class EnvironmentConfigurationError extends Error {
  override readonly name = "EnvironmentConfigurationError";
}

const environmentSchema = z.object({
  DISCORD_TOKEN: z.string({ error: "is required" }).trim().min(1, "is required"),
  DATABASE_URL: z
    .url({ protocol: /^postgres(?:ql)?$/, error: "must be a PostgreSQL URL" })
    .refine((value) => {
      try {
        const url = new URL(value);
        return Boolean(url.hostname) && url.pathname.length > 1;
      } catch {
        return false;
      }
    }, "must include a host and database name"),
  CENTERIFY_MODULES: z.string().optional(),
  SHUTDOWN_TIMEOUT_MS: z.preprocess(
    (value) => (value === undefined ? 10_000 : value),
    z.coerce.number().int().min(1_000).max(120_000),
  ),
});

/** Parse at the executable boundary before loading Discord or database resources. */
export function parseEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const result = environmentSchema.safeParse(env);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new EnvironmentConfigurationError(
      `Invalid environment configuration:\n${fields.join("\n")}\nSee .env.example.`,
    );
  }
  let modules;
  try {
    modules = parseModuleConfiguration(result.data.CENTERIFY_MODULES);
  } catch {
    throw new EnvironmentConfigurationError(
      "CENTERIFY_MODULES must be a valid module configuration object. See docs/configuration.md.",
    );
  }
  return {
    discordToken: result.data.DISCORD_TOKEN,
    databaseUrl: result.data.DATABASE_URL,
    shutdownTimeoutMs: result.data.SHUTDOWN_TIMEOUT_MS,
    modules,
    logging: parseLoggingConfiguration(env),
  };
}

export type EnvironmentConfiguration = ReturnType<typeof parseEnvironment>;
