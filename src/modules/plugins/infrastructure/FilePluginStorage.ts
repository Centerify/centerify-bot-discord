import { join } from "node:path";
import type { PluginStorage } from "../domain/manifest.js";
import { PluginError, pluginId } from "../domain/manifest.js";
import { atomicJson, fileLock, readJson } from "./files.js";

export class FilePluginStorage implements PluginStorage {
  private readonly root: string;
  constructor(stateRoot: string, id: string) {
    this.root = join(stateRoot, "data", pluginId.parse(id));
  }
  private path(guildId: string) {
    if (!/^\d{17,20}$/.test(guildId))
      throw new PluginError("Invalid server ID for plugin storage.");
    return join(this.root, `${guildId}.json`);
  }
  async read(guildId: string) {
    return readJson(this.path(guildId), null);
  }
  async update<T>(guildId: string, operation: (value: unknown) => { value: unknown; result: T }) {
    const path = this.path(guildId);
    return fileLock(`${path}.lock`, async () => {
      const { value, result } = operation(await readJson(path, null));
      if (Buffer.byteLength(JSON.stringify(value)) > 8 * 1024 * 1024)
        throw new PluginError(
          "Plugin server data exceeds its 8 MiB limit. Export and archive old records first.",
        );
      await atomicJson(path, value);
      return result;
    });
  }
}
