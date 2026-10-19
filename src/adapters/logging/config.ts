import { z } from "zod";

export const logLevelSchema = z.enum([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "silent",
]);
export const logFormatSchema = z.enum(["json", "pretty"]);

export function parseLoggingConfiguration(
  env: NodeJS.ProcessEnv = process.env,
  overrides: { level?: string; format?: string } = {},
) {
  const result = z
    .object({
      NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
      LOG_LEVEL: logLevelSchema.default("info"),
      LOG_FORMAT: logFormatSchema.optional(),
    })
    .safeParse({
      ...env,
      LOG_LEVEL: env.LOG_LEVEL ?? overrides.level,
      LOG_FORMAT: env.LOG_FORMAT ?? overrides.format,
    });
  if (!result.success)
    throw new Error(
      `Invalid logging configuration: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}. See .env.example.`,
    );
  return {
    level: result.data.LOG_LEVEL,
    format: result.data.LOG_FORMAT ?? (result.data.NODE_ENV === "production" ? "json" : "pretty"),
  };
}
