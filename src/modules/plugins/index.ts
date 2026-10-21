import { serviceToken, type CenterifyModule } from "../../core/index.js";
import type { PluginManifest } from "./domain/manifest.js";
export * from "./domain/manifest.js";

export interface PluginManager {
  catalog(): Promise<{ manifest: PluginManifest; sha256: string; packagePath: string }[]>;
  installed(): Promise<{
    plugins: Record<
      string,
      { manifest: PluginManifest; enabled: boolean; installedAt: string; sha256: string }
    >;
  }>;
}
export const pluginManagerToken = serviceToken<PluginManager>("plugins.manager");
export function createPluginsModule(manager: PluginManager): CenterifyModule {
  return {
    metadata: {
      id: "plugins",
      name: "Plugin marketplace and installer",
      version: "1.0.0",
      dependsOn: ["guilds"],
    },
    register(context) {
      context.provide(pluginManagerToken, manager);
    },
  };
}
