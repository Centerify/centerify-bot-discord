import { currentApplication } from "../../../adapters/discord/context.js";
export function settingsModuleFor(action: string): string | undefined {
  if (action.startsWith("xp")) return "xp";
  if (["welcome", "goodbye", "autorole"].some((prefix) => action.startsWith(prefix))) return "welcome";
  if (action.startsWith("moderation") || action.startsWith("global-")) return "moderation";
  if (action.startsWith("custom-commands")) return "custom-commands";
  return undefined;
}
export function settingsActionAvailable(action: string) {
  const module = settingsModuleFor(action);
  return !module || currentApplication().isEnabled(module);
}
