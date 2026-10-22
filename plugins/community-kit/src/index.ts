import type { PluginSdk, PluginExport } from "../../../src/modules/plugins/discord/sdk.js";
import type { DashboardExtension } from "../../../src/dashboard/extensions.js";
export function communityExtension(z: PluginSdk["z"]): DashboardExtension {
  return {
    manifest: {
      apiVersion: 1,
      id: "community-kit",
      name: "Community Kit",
      version: "1.0.0",
      dashboardApi: 1,
      description:
        "A trusted example extension: community checklist, a violet theme and a greeting action for your workflows.",
      dependencies: ["guilds"],
      capabilities: [
        "dashboard.widget",
        "dashboard.route",
        "dashboard.theme",
        "builder.node",
        "bot.respond",
      ],
      navigation: [{ id: "community", label: "Community Kit" }],
      widgets: [
        {
          id: "checklist",
          title: "A warmer welcome",
          description:
            "Connect a welcome channel, choose an automatic role, and publish a greeting workflow.",
        },
      ],
      themes: [{ id: "violet", accent: "#a78bfa" }],
      nodes: [{ id: "greeting", label: "Community greeting", capability: "bot.respond" }],
    },
    settings: z
      .object({ greeting: z.string().trim().min(1).max(1000).default("Welcome to the community!") })
      .strict(),
    async execute(node, input) {
      if (node !== "greeting") throw new Error("Unknown Community Kit action");
      const settings = this.settings.parse(input.config) as { greeting: string };
      await input.respond(input.text || settings.greeting);
      return "Community greeting sent";
    },
  };
}
export default function communityKit(sdk: PluginSdk): PluginExport {
  return {
    module: {
      metadata: {
        id: "community-kit",
        name: "Community Kit",
        version: "1.0.0",
        dependsOn: ["guilds"],
      },
      register() {},
    },
    discord: {},
    dashboard: communityExtension(sdk.z),
  };
}
