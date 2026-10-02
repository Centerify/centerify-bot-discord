import { container } from "@sapphire/framework";
import { PROTECTED_COMMAND_NAMES } from "../../lib/customCommands/constants.js";
export function registeredCommandNames(): string[] {
  const store = container.stores?.get("commands");
  if (!store) return [];
  return [...store.values()].flatMap((command) => {
    const registry = command.applicationCommandRegistry as unknown as {
      apiCalls?: { builtData?: { name?: string } }[];
    };
    return [
      command.name,
      ...command.aliases,
      ...(registry.apiCalls?.flatMap((call) =>
        call.builtData?.name ? [call.builtData.name] : [],
      ) ?? []),
    ];
  });
}

export function isBuiltInCommand(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return [...PROTECTED_COMMAND_NAMES, ...registeredCommandNames()].some(
    (value) => value.trim().toLowerCase() === normalized,
  );
}
