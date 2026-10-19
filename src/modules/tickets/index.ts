import { serviceToken, type CenterifyModule } from "../../core/index.js";

export const ticketLocksToken = serviceToken<Set<string>>("tickets.locks");
export function createTicketsModule(): CenterifyModule {
  return {
    metadata: {
      id: "tickets",
      name: "Private support tickets",
      version: "1.0.0",
      dependsOn: ["guilds"],
    },
    register(context) {
      const locks = new Set<string>();
      context.provide(ticketLocksToken, locks);
      context.onStop(() => {
        locks.clear();
      });
    },
  };
}
