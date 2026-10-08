import { AsyncLocalStorage } from "node:async_hooks";
import { container } from "@sapphire/framework";
import type { Client } from "discord.js";
import type { ModuleRegistry, ServiceToken } from "../../core/index.js";

const requests = new AsyncLocalStorage<ModuleRegistry>();
const applications = new WeakMap<Client, ModuleRegistry>();

export function bindApplication(client: Client, application: ModuleRegistry) {
  if (applications.has(client)) throw new Error("Discord client already has an application");
  applications.set(client, application);
  return () => { applications.delete(client); };
}

export function withApplication<T>(application: ModuleRegistry, run: () => T): T {
  return requests.run(application, run);
}

export function currentApplication() {
  const application = requests.getStore() ?? applications.get(container.client);
  if (!application) throw new Error("Discord adapter has no application context");
  return application;
}

/** Only presentation adapters use this bridge. Application services use constructor injection. */
export function serviceRef<T extends object>(token: ServiceToken<T>): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const service = currentApplication().resolve(token);
      const value: unknown = Reflect.get(service, property);
      return typeof value === "function" ? value.bind(service) : value;
    },
  });
}
