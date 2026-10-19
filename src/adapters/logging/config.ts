import { z } from "zod";

export function parseLoggingConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const result = z
    .object({
      NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
      LOG_LEVEL: z
        .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
        .default("info"),
      LOG_FORMAT: z.enum(["json", "pretty"]).optional(),
    })
    .safeParse(env);
  if (!result.success)
    throw new Error(
      `Invalid logging configuration: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}. See .env.example.`,
    );
  return {
    level: result.data.LOG_LEVEL,
    format: result.data.LOG_FORMAT ?? (result.data.NODE_ENV === "production" ? "json" : "pretty"),
  };
}
