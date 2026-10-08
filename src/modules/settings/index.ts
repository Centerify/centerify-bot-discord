import type { CenterifyModule } from "../../core/index.js";
export function createSettingsModule(): CenterifyModule {
  return { metadata: { id: "settings", name: "Server settings", version: "1.0.0", dependsOn: ["guilds"] }, register() {} };
}
