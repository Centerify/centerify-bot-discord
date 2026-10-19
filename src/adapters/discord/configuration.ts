import type { Command } from "@sapphire/framework";
import { ActivityType, type Client } from "discord.js";
import { serviceToken } from "../../core/index.js";
import type { CenterifyConfiguration, CommandConfiguration } from "../../configuration.js";

export const botIdentityToken = serviceToken<CenterifyConfiguration["bot"]>("discord.identity");

export function validateCommandConfiguration(
  names: readonly string[],
  config: CommandConfiguration,
) {
  const canonical = new Set(names);
  const publicNames = new Set<string>();
  for (const name of Object.keys(config)) {
    if (!canonical.has(name)) throw new Error(`Unknown or unavailable configured command: ${name}`);
    if (
      ["verify", "unverify"].includes(name) &&
      (config[name]!.enabled === false || (config[name]!.name && config[name]!.name !== name))
    )
      throw new Error(`The ownership command ${name} must retain its name and remain enabled`);
  }
  for (const name of names) {
    const options = config[name];
    if (options?.enabled === false) continue;
    for (const exposed of [options?.name ?? name, ...(options?.aliases ?? [])]) {
      if (publicNames.has(exposed) || (exposed !== name && canonical.has(exposed)))
        throw new Error(`Duplicate or reserved configured command name: ${exposed}`);
      publicNames.add(exposed);
    }
  }
  if (publicNames.size > 100)
    throw new Error("Discord allows at most 100 slash commands including aliases");
}

/** Adapt registration only: every alias uses the same piece, options and preconditions. */
export function configuredRegistry(
  registry: Command.Registry,
  options: CommandConfiguration[string] = {},
): Command.Registry {
  return new Proxy(registry, {
    get(target, property) {
      if (property !== "registerChatInputCommand") {
        const value: unknown = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return (
        ...[build, registration]: Parameters<Command.Registry["registerChatInputCommand"]>
      ) => {
        for (const name of [options.name, ...(options.aliases ?? [])]) {
          const patch = {
            ...(name ? { name, name_localizations: undefined } : {}),
            ...(options.description
              ? { description: options.description, description_localizations: undefined }
              : {}),
          };
          if (typeof build === "function") {
            target.registerChatInputCommand((builder) => {
              build(builder);
              if (name) builder.setName(name).setNameLocalizations(null);
              if (options.description)
                builder.setDescription(options.description).setDescriptionLocalizations(null);
              return builder;
            }, registration);
          } else if ("toJSON" in build) {
            // Use the registry's builder, including when a plugin bundles another builder version.
            target.registerChatInputCommand((builder) => {
              builder.toJSON = () => ({ ...build.toJSON(), ...patch });
              return builder;
            }, registration);
          } else {
            target.registerChatInputCommand(
              {
                ...build,
                ...(name ? { name, nameLocalizations: undefined } : {}),
                ...(options.description
                  ? { description: options.description, descriptionLocalizations: undefined }
                  : {}),
              } as Parameters<Command.Registry["registerChatInputCommand"]>[0],
              registration,
            );
          }
        }
        return registry;
      };
    },
  });
}

export async function applyBotIdentity(client: Client<true>, bot: CenterifyConfiguration["bot"]) {
  if (bot.name && client.user.username !== bot.name) await client.user.setUsername(bot.name);
  if (bot.description !== undefined && client.application.description !== bot.description)
    await client.application.edit({ description: bot.description });
}

export function configuredPresence(bot: CenterifyConfiguration["bot"]) {
  if (!bot.presence) return undefined;
  return {
    status: bot.presence.status,
    activities: bot.presence.activity
      ? [{ name: bot.presence.activity.name, type: ActivityType[bot.presence.activity.type] }]
      : [],
  };
}
