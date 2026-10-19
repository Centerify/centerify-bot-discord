import { join, resolve } from "node:path";
import { catalogSchema, installedSchema, pluginId, PluginError } from "../domain/manifest.js";
import { readJson, within } from "./files.js";

/** Read-only host view. Only the native terminal installer changes installation state. */
export class LocalPluginRegistry {
  readonly stateRoot: string;
  constructor(
    readonly projectRoot: string,
    stateRoot = join(projectRoot, ".centerify"),
  ) {
    this.stateRoot = resolve(stateRoot);
  }
  async catalog() {
    const catalog = catalogSchema.parse(
      await readJson(join(this.projectRoot, "marketplace/catalog.json"), {
        schemaVersion: 1,
        plugins: [],
      }),
    );
    if (new Set(catalog.plugins.map((entry) => entry.manifest.id)).size !== catalog.plugins.length)
      throw new PluginError("Duplicate marketplace plugin IDs.");
    return catalog.plugins;
  }
  async installed() {
    const state = installedSchema.parse(
      await readJson(join(this.stateRoot, "installed.json"), { schemaVersion: 1, plugins: {} }),
    );
    for (const [id, entry] of Object.entries(state.plugins))
      if (id !== entry.manifest.id) throw new PluginError("Installed plugin identity mismatch.");
    return state;
  }
  packagePath(id: string, version: string) {
    pluginId.parse(id);
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new PluginError("Invalid plugin version.");
    return within(this.projectRoot, `plugins/installed/${id}/${version}`);
  }
}
