import type { CenterifyModule } from "../../core/index.js";

export function createManagementModule(): CenterifyModule {
  return {
    metadata: {
      id: "management",
      name: "Server, channel and role management",
      version: "1.0.0",
      dependsOn: ["guilds"],
    },
    register() {},
  };
}
