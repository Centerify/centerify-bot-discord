export class GuildSettingsError extends Error {}

export type WarningRoleSettings = {
  mode: "numbered" | "single" | "none";
  numberedName: string;
  singleName: string;
  singleRoleId: string | null;
  color: number;
  hoist: boolean;
  mentionable: boolean;
  defaultDurationMs: number | null;
};

export const DEFAULT_WARNING_ROLE_SETTINGS: Readonly<WarningRoleSettings> = {
  mode: "numbered", numberedName: "warn{count}", singleName: "Warned",
  singleRoleId: null, color: 0, hoist: false, mentionable: false,
  defaultDurationMs: null,
};

export type CommandRoleRule = { allowedRoleIds: string[]; deniedRoleIds: string[] };
export type CommandRoleAccess = Record<string, CommandRoleRule>;
export const PROTECTED_ACCESS_COMMANDS = ["settings", "setup", "verify", "unverify"] as const;

function object(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new GuildSettingsError(`${label} must be an object.`);
  return input as Record<string, unknown>;
}

export function warningRoleSettings(input: unknown): WarningRoleSettings {
  if (input === undefined || input === null) return { ...DEFAULT_WARNING_ROLE_SETTINGS };
  const raw = object(input, "Warning settings");
  if (Object.keys(raw).some((key) => !Object.hasOwn(DEFAULT_WARNING_ROLE_SETTINGS, key)))
    throw new GuildSettingsError("Unknown warning setting.");
  const value = { ...DEFAULT_WARNING_ROLE_SETTINGS, ...raw };
  if (!["numbered", "single", "none"].includes(value.mode as string))
    throw new GuildSettingsError("Choose numbered roles, one shared role or no role.");
  for (const key of ["numberedName", "singleName"] as const) {
    if (typeof value[key] !== "string" || !value[key].trim() || value[key].length > 80)
      throw new GuildSettingsError("Warning role names must contain 1–80 characters.");
  }
  if (!/^[^{}]*\{count\}[^{}]*$/.test(value.numberedName as string))
    throw new GuildSettingsError("Numbered role names must contain exactly one {count}, for example warn{count}.");
  if (value.singleRoleId !== null && (typeof value.singleRoleId !== "string" || !/^\d{17,20}$/.test(value.singleRoleId)))
    throw new GuildSettingsError("Choose a valid shared warning role.");
  if (typeof value.color !== "number" || !Number.isInteger(value.color) || value.color < 0 || value.color > 0xffffff)
    throw new GuildSettingsError("Use a color between #000000 and #ffffff.");
  if (typeof value.hoist !== "boolean" || typeof value.mentionable !== "boolean")
    throw new GuildSettingsError("Role display settings must be booleans.");
  if (value.defaultDurationMs !== null && (typeof value.defaultDurationMs !== "number" || !Number.isInteger(value.defaultDurationMs) || value.defaultDurationMs < 60_000 || value.defaultDurationMs > 28 * 24 * 60 * 60_000))
    throw new GuildSettingsError("Default warning duration must be permanent or between 1m and 28d.");
  return value as WarningRoleSettings;
}

export function commandRoleAccess(input: unknown): CommandRoleAccess {
  if (input === undefined || input === null) return {};
  const raw = object(input, "Command role access");
  if (Object.keys(raw).length > 100) throw new GuildSettingsError("Use at most 100 command access rules.");
  const rules: CommandRoleAccess = Object.create(null);
  for (const [name, inputRule] of Object.entries(raw)) {
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(name) || PROTECTED_ACCESS_COMMANDS.some((protectedName) => protectedName === name))
      throw new GuildSettingsError("Settings, setup and server verification commands retain their normal administrator access.");
    const rule = object(inputRule, "Command rule");
    if (Object.keys(rule).some((key) => !["allowedRoleIds", "deniedRoleIds"].includes(key)))
      throw new GuildSettingsError("Unknown command access setting.");
    const checked = (key: keyof CommandRoleRule): string[] => {
      const ids = rule[key] ?? [];
      if (!Array.isArray(ids) || ids.length > 25 || ids.some((id) => typeof id !== "string" || !/^\d{17,20}$/.test(id)) || new Set(ids).size !== ids.length)
        throw new GuildSettingsError("Select up to 25 different server roles per access list.");
      return [...ids];
    };
    rules[name] = { allowedRoleIds: checked("allowedRoleIds"), deniedRoleIds: checked("deniedRoleIds") };
  }
  return rules;
}

export function commandRoleDenial(input: unknown, name: string, roleIds: ReadonlySet<string>): string | null {
  if (PROTECTED_ACCESS_COMMANDS.some((protectedName) => protectedName === name)) return null;
  const rule = commandRoleAccess(input)[name];
  if (!rule) return null;
  if (rule.deniedRoleIds.some((id) => roleIds.has(id))) return `One of your roles is denied access to /${name}.`;
  if (rule.allowedRoleIds.length && !rule.allowedRoleIds.some((id) => roleIds.has(id)))
    return `You need one of the allowed roles to use /${name}.`;
  return null;
}
