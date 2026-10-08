import { DiscordResources, discordResourcesToken } from "./resources.js";
import { Command, Precondition, type SapphireClient } from "@sapphire/framework";
import type { Client, ClientEvents } from "discord.js";
import { loggerToken, serviceToken, type CenterifyModule, type ModuleContext, type ModuleRegistry } from "../../core/index.js";
import { bindApplication, withApplication } from "./context.js";

type CommandConstructor = new (context: Command.LoaderContext, options: Command.Options) => Command;
export interface DiscordEvent {
  readonly event: keyof ClientEvents;
  readonly order: number;
  run(args: readonly unknown[]): Promise<void>;
}
export function discordEvent<K extends keyof ClientEvents>(event: K, run: (...args: ClientEvents[K]) => void | Promise<void>, order = 0): DiscordEvent {
  return { event, order, async run(args) { await run(...args as unknown as ClientEvents[K]); } };
}
export interface DiscordModule {
  commands?: Readonly<Record<string, CommandConstructor>>;
  preconditions?: Readonly<Record<string, new (context: Precondition.LoaderContext, options: Precondition.Options) => Precondition>>;
  register?(context: ModuleContext): void | Promise<void>;
  events?: readonly DiscordEvent[];
  attach?(client: Client, context: ModuleContext): void | (() => void | Promise<void>);
}
export const discordModuleToken = serviceToken<{ definition: DiscordModule; context: ModuleContext }>("discord.modules");

export function withDiscord(module: CenterifyModule, load: () => Promise<DiscordModule>): CenterifyModule {
  return {
    start: module.start?.bind(module),
    stop: module.stop?.bind(module),
    metadata: { ...module.metadata, dependsOn: [...new Set(["runtime", ...(module.metadata.dependsOn ?? [])])] },
    async register(context) {
      const resources = new DiscordResources();
      context.onStop(() => resources.stop());
      context.contribute(discordResourcesToken, resources);
      await module.register(context);
      const definition = await load();
      await definition.register?.(context);
      context.contribute(discordModuleToken, { definition, context });
    },
  };
}

export async function dispatchDiscordEvent(application: ModuleRegistry, event: keyof ClientEvents, ...args: readonly unknown[]) {
  const handlers = application.extensions(discordModuleToken).flatMap(({ value }) => value.definition.events ?? []).filter((handler) => handler.event === event);
  await runHandlers(application, event, handlers, args);
}

async function runHandlers(application: ModuleRegistry, event: keyof ClientEvents, handlers: readonly DiscordEvent[], args: readonly unknown[]) {
  await withApplication(application, async () => {
    const orders = [...new Set(handlers.map((handler) => handler.order))].sort((a, b) => a - b);
    for (const order of orders) {
      await Promise.all(handlers.filter((handler) => handler.order === order).map(async (handler) => {
        try { await handler.run(args); }
        catch (error) { application.resolve(loggerToken).error({ err: error, event }, "Discord module event failed"); }
      }));
    }
  });
}

export async function installDiscordModules(client: SapphireClient, application: ModuleRegistry) {
  const unbind = bindApplication(client, application);
  const disposers: (() => void | Promise<void>)[] = [];
  const commands = new Set<string>();
  const events = new Map<keyof ClientEvents, DiscordEvent[]>();
  const inFlight = new Set<Promise<unknown>>();
  try {
    for (const { value: { definition, context } } of application.extensions(discordModuleToken)) {
      for (const [name, piece] of Object.entries(definition.preconditions ?? {})) {
        await client.stores.get("preconditions").loadPiece({ name, piece });
      }
      for (const [name, Original] of Object.entries(definition.commands ?? {})) {
        if (commands.has(name)) throw new Error(`Duplicate Discord command: ${name}`);
        commands.add(name);
        class ScopedCommand extends Original {
          override registerApplicationCommands(registry: Command.Registry) {
            return withApplication(application, () => super.registerApplicationCommands?.(registry));
          }
          override chatInputRun(interaction: Command.ChatInputCommandInteraction) {
            const pending = Promise.resolve(withApplication(application, () => super.chatInputRun!(interaction, { commandName: name, commandId: interaction.commandId })));
            inFlight.add(pending);
            void pending.then(() => inFlight.delete(pending), () => inFlight.delete(pending));
            return pending;
          }
        }
        await client.stores.get("commands").loadPiece({ name, piece: ScopedCommand });
      }
      const dispose = withApplication(application, () => definition.attach?.(client, context));
      if (dispose) disposers.push(dispose);
      for (const event of definition.events ?? []) {
        const handlers = events.get(event.event) ?? [];
        handlers.push(event);
        events.set(event.event, handlers);
      }
    }
    for (const [event, handlers] of events) {
      const listener = (...args: unknown[]) => {
        const pending = runHandlers(application, event, handlers, args);
        inFlight.add(pending);
        void pending.then(() => inFlight.delete(pending), () => inFlight.delete(pending));
      };
      client.on(event, listener);
      disposers.push(() => { client.off(event, listener); });
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) await dispose();
    unbind();
    throw error;
  }
  return async () => {
    const errors: unknown[] = [];
    for (const dispose of disposers.reverse()) {
      try { await dispose(); } catch (error) { errors.push(error); }
    }
    await Promise.allSettled(inFlight);
    unbind();
    if (errors.length) throw new AggregateError(errors, "Discord adapters failed to stop");
  };
}
