import type { PluginSdk, PluginExport } from "../../../src/modules/plugins/discord/sdk.js";
import { Runtime } from "./runtime.js";
import { ticketCommand } from "./commands.js";

export default function betterTicket(sdk: PluginSdk): PluginExport {
  const runtime = new Runtime(sdk);
  return {
    module: {
      metadata: {
        id: "better-ticket",
        name: "Better Ticket",
        version: "1.0.0",
        dependsOn: ["guilds"],
      },
      register(context) {
        context.onStop(() => runtime.stop());
      },
    },
    discord: {
      commands: { bticket: ticketCommand(sdk, runtime) },
      attach: (client) => runtime.attach(client),
      events: [
        {
          event: "interactionCreate",
          order: 0,
          async run(args) {
            const input = args[0] as import("discord.js").Interaction;
            if (
              (input.isButton() || input.isStringSelectMenu() || input.isModalSubmit()) &&
              input.customId.startsWith("bt:")
            )
              await runtime.component(input);
          },
        },
        {
          event: "messageCreate",
          order: 0,
          async run(args) {
            await runtime.message(args[0] as import("discord.js").Message);
          },
        },
        {
          event: "clientReady",
          order: 0,
          async run(args) {
            await runtime.sweep(args[0] as import("discord.js").Client);
          },
        },
      ],
    },
  };
}
