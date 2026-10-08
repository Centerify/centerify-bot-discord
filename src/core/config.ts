import type { ModuleOptions } from "./module.js";

export type ModuleConfiguration = Readonly<Record<string, ModuleOptions>>;

/** Environment parsing belongs here; feature configuration belongs to each module. */
export function parseModuleConfiguration(json: string | undefined): ModuleConfiguration {
  if (!json) return {};
  const value: unknown = JSON.parse(json);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CENTERIFY_MODULES must be a JSON object keyed by module ID");
  }
  const result: Record<string, ModuleOptions> = {};
  for (const [id, options] of Object.entries(value)) {
    if (typeof options === "boolean") result[id] = { enabled: options };
    else if (options && typeof options === "object" && !Array.isArray(options)) {
      const fields = options as Record<string, unknown>;
      if (fields.enabled !== undefined && typeof fields.enabled !== "boolean") {
        throw new Error(`Module ${id}: enabled must be a boolean`);
      }
      if (Object.keys(fields).some((key) => key !== "enabled" && key !== "config")) {
        throw new Error(`Module ${id}: expected enabled and config options`);
      }
      result[id] = { enabled: fields.enabled as boolean | undefined, config: fields.config };
    } else throw new Error(`Invalid configuration for module ${id}`);
  }
  return result;
}
