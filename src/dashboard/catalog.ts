import { type Command, type SapphireClient } from "@sapphire/framework";
import {
  SlashCommandBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import { withApplication } from "../adapters/discord/context.js";
import type { ModuleRegistry } from "../core/index.js";
export function commandCatalog(client: SapphireClient, application: ModuleRegistry) {
  const catalog: {
    name: string;
    canonical: string;
    description: string;
    permissions: string | null;
    protected: boolean;
    options: unknown;
  }[] = [];
  for (const command of client.stores.get("commands").values()) {
    const capture = {
      registerChatInputCommand(input: Parameters<Command.Registry["registerChatInputCommand"]>[0]) {
        const builder = new SlashCommandBuilder();
        if (typeof input === "function") input(builder);
        const result =
          typeof input === "function"
            ? builder.toJSON()
            : "toJSON" in input
              ? input.toJSON()
              : input;
        const json = result as RESTPostAPIChatInputApplicationCommandsJSONBody;
        catalog.push({
          name: json.name,
          canonical: command.name,
          description: json.description,
          permissions: json.default_member_permissions ?? null,
          protected: ["verify", "unverify", "setup", "settings"].includes(command.name),
          options: json.options ?? [],
        });
        return capture;
      },
      registerContextMenuCommand() {
        return capture;
      },
    };
    withApplication(application, () =>
      command.registerApplicationCommands?.(capture as unknown as Command.Registry),
    );
  }
  return catalog;
}
