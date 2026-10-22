import { z } from "zod";
import { serviceToken } from "../core/index.js";
import { DashboardError } from "./contracts.js";

const id = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);
export const dashboardExtensionSchema = z
  .object({
    apiVersion: z.literal(1),
    id,
    name: z.string().min(1).max(80),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    dashboardApi: z.literal(1),
    description: z.string().max(500),
    dependencies: z.array(id).max(20),
    capabilities: z
      .array(
        z.enum([
          "dashboard.widget",
          "dashboard.route",
          "dashboard.theme",
          "builder.node",
          "bot.respond",
          "analytics",
          "notifications",
        ]),
      )
      .max(10),
    navigation: z.array(z.object({ id, label: z.string().max(40) }).strict()).max(5),
    widgets: z
      .array(z.object({ id, title: z.string().max(60), description: z.string().max(300) }).strict())
      .max(5),
    themes: z
      .array(z.object({ id, accent: z.string().regex(/^#[a-fA-F0-9]{6}$/) }).strict())
      .max(5),
    nodes: z
      .array(
        z.object({ id, label: z.string().max(60), capability: z.literal("bot.respond") }).strict(),
      )
      .max(10),
  })
  .strict();
export type DashboardExtensionManifest = z.infer<typeof dashboardExtensionSchema>;
export interface DashboardExtension {
  manifest: DashboardExtensionManifest;
  settings: z.ZodType;
  execute(
    node: string,
    input: { config: Record<string, unknown>; text: string; respond(text: string): Promise<void> },
  ): Promise<string>;
}
export const dashboardExtensionToken = serviceToken<DashboardExtension>("dashboard.extensions");
export function validateExtensions(
  extensions: readonly DashboardExtension[],
  installed: ReadonlySet<string>,
) {
  const ids = new Set<string>();
  for (const ext of extensions) {
    const m = dashboardExtensionSchema.parse(ext.manifest);
    if (ids.has(m.id)) throw new DashboardError(400, "Duplicate dashboard extension");
    if (m.dependencies.some((dependency) => !installed.has(dependency)))
      throw new DashboardError(409, `${m.name} has missing dependencies`);
    if (
      m.nodes.length &&
      (!m.capabilities.includes("builder.node") || !m.capabilities.includes("bot.respond"))
    )
      throw new DashboardError(400, "Builder nodes require declared capabilities");
    if (m.widgets.length && !m.capabilities.includes("dashboard.widget"))
      throw new DashboardError(400, "Widget capability is required");
    if (m.navigation.length && !m.capabilities.includes("dashboard.route"))
      throw new DashboardError(400, "Route capability is required");
    if (m.themes.length && !m.capabilities.includes("dashboard.theme"))
      throw new DashboardError(400, "Theme capability is required");
    ids.add(m.id);
  }
}
