import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { parseModuleConfiguration } from "./core/config.js";
import { logFormatSchema, logLevelSchema } from "./adapters/logging/config.js";

const commandName = z.string().regex(/^[a-z0-9_-]{1,32}$/);
const moduleOptions = z.union([
  z.boolean(),
  z.strictObject({ enabled: z.boolean().optional(), config: z.unknown().optional() }),
]);

/** Only overrides live here; command definitions and module defaults stay with their owners. */
export const configurationSchema = z.strictObject({
  $schema: z.string().optional(),
  envFile: z.string().min(1).optional(),
  bot: z
    .strictObject({
      name: z.string().trim().min(2).max(32).optional(),
      description: z.string().max(400).optional(),
      presence: z
        .strictObject({
          status: z.enum(["online", "idle", "dnd", "invisible"]).optional(),
          activity: z
            .strictObject({
              name: z.string().min(1).max(128),
              type: z.enum(["Playing", "Listening", "Watching", "Competing"]),
            })
            .optional(),
        })
        .optional(),
    })
    .default({}),
  commands: z
    .record(
      commandName,
      z.strictObject({
        enabled: z.boolean().optional(),
        name: commandName.optional(),
        description: z.string().min(1).max(100).optional(),
        aliases: z.array(commandName).max(20).optional(),
      }),
    )
    .default({}),
  modules: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), moduleOptions).default({}),
  startup: z
    .strictObject({
      enabled: z.boolean().optional(),
      loginTimeoutMs: z.number().int().min(1000).max(120000).optional(),
      shutdownTimeoutMs: z.number().int().min(1000).max(120000).optional(),
      commandGuildIds: z.array(z.string().regex(/^\d{17,20}$/)).optional(),
      commandRegistrationRetries: z.number().int().min(1).max(10).optional(),
    })
    .default({}),
  logging: z
    .strictObject({
      level: logLevelSchema.optional(),
      format: logFormatSchema.optional(),
    })
    .default({}),
  plugins: z.strictObject({ stateDirectory: z.string().min(1).optional() }).default({}),
});

export type CenterifyConfiguration = z.infer<typeof configurationSchema>;
export type CommandConfiguration = CenterifyConfiguration["commands"];

export function parseConfiguration(value: unknown): CenterifyConfiguration {
  const result = configurationSchema.safeParse(value);
  if (!result.success) {
    // Paths identify typos without echoing submitted values (which may contain secrets).
    throw new Error(
      `Invalid Centerify configuration at: ${result.error.issues.map((issue) => issue.path.join(".") || "root").join(", ")}. See docs/configuration.md.`,
    );
  }
  parseModuleConfiguration(JSON.stringify(result.data.modules));
  return result.data;
}

export function loadConfiguration(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()) {
  const explicit = env.CENTERIFY_CONFIG;
  const path = resolve(cwd, explicit ?? "centerify.config.json");
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch (error) {
    if (!explicit && (error as NodeJS.ErrnoException).code === "ENOENT")
      return parseConfiguration({});
    throw new Error("Cannot read Centerify configuration file. Check CENTERIFY_CONFIG.", {
      cause: error,
    });
  }
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error("Centerify configuration file must contain valid JSON.");
  }
  return parseConfiguration(value);
}
