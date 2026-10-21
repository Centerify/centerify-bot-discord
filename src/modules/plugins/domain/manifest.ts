import { z } from "zod";

export const pluginId = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);
export const pluginManifestSchema = z
  .object({
    id: pluginId,
    name: z.string().min(1).max(80),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    description: z.string().min(1).max(500),
    apiVersion: z.literal(1),
    entrypoint: z.string().regex(/^[a-zA-Z0-9_./-]+\.js$/),
    permissions: z.array(z.string().min(1).max(80)).max(30),
    dependencies: z.array(pluginId).max(20).default(["guilds"]),
  })
  .strict();
export type PluginManifest = z.infer<typeof pluginManifestSchema>;
export const catalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    plugins: z
      .array(
        z
          .object({
            manifest: pluginManifestSchema,
            packagePath: z.string().min(1),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type Catalog = z.infer<typeof catalogSchema>;
export const installedSchema = z
  .object({
    schemaVersion: z.literal(1),
    plugins: z.record(
      pluginId,
      z
        .object({
          manifest: pluginManifestSchema,
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
          enabled: z.boolean(),
          installedAt: z.iso.datetime(),
        })
        .strict(),
    ),
  })
  .strict();
export type InstalledRegistry = z.infer<typeof installedSchema>;
export class PluginError extends Error {}

export interface PluginStorage {
  read(guildId: string): Promise<unknown>;
  update<T>(
    guildId: string,
    operation: (value: unknown) => { value: unknown; result: T },
  ): Promise<T>;
}
