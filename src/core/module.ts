import { ServiceContainer, type ServiceToken } from "./container.js";

export interface ModuleMetadata {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly dependsOn?: readonly string[];
}

export interface ModuleContext {
  readonly config: unknown;
  provide<T>(key: ServiceToken<T>, value: NoInfer<T>): void;
  resolve<T>(key: ServiceToken<T>): T;
  contribute<T>(key: ServiceToken<T>, value: NoInfer<T>): void;
  onStop(dispose: () => void | Promise<void>): void;
}

export interface CenterifyModule {
  readonly metadata: ModuleMetadata;
  register(context: ModuleContext): void | Promise<void>;
  start?(): void | Promise<void>;
  stop?(): void | Promise<void>;
}

export interface ModuleOptions {
  enabled?: boolean;
  config?: unknown;
}

type State = "idle" | "starting" | "running" | "stopping";

export class ModuleRegistry {
  private readonly modules = new Map<string, CenterifyModule>();
  private readonly options = new Map<string, ModuleOptions>();
  private readonly services = new ServiceContainer();
  private readonly contributions = new Map<symbol, { moduleId: string; value: unknown }[]>();
  private readonly disposers = new Map<string, (() => void | Promise<void>)[]>();
  private activated: CenterifyModule[] = [];
  private state: State = "idle";

  register(module: CenterifyModule, options: ModuleOptions = {}) {
    if (this.state !== "idle") throw new Error("Cannot register modules after startup has begun");
    const { id, name, version } = module.metadata;
    if (!/^[a-z][a-z0-9-]*$/.test(id) || !name || !version || this.modules.has(id)) {
      throw new Error(`Invalid or duplicate module id: ${id}`);
    }
    this.modules.set(id, module);
    this.options.set(id, { ...options });
    return this;
  }

  list() {
    return [...this.modules.values()].map(({ metadata }) => ({
      ...metadata, dependsOn: [...(metadata.dependsOn ?? [])],
      enabled: this.isEnabled(metadata.id), config: this.options.get(metadata.id)?.config,
    }));
  }

  isEnabled(id: string) {
    return this.modules.has(id) && this.options.get(id)?.enabled !== false;
  }

  resolve<T>(key: ServiceToken<T>): T { return this.services.resolve(key); }

  extensions<T>(key: ServiceToken<T>): readonly { moduleId: string; value: T }[] {
    return (this.contributions.get(key.key) ?? []).map((entry) => ({
      moduleId: entry.moduleId, value: entry.value as T,
    }));
  }

  async start() {
    if (this.state !== "idle") throw new Error(`Cannot start registry while ${this.state}`);
    const ordered = this.orderEnabledModules();
    this.state = "starting";
    try {
      // All services are composed before any module starts background work.
      for (const module of ordered) {
        const id = module.metadata.id;
        this.activated.push(module);
        this.disposers.set(id, []);
        await module.register({
          config: this.options.get(id)?.config,
          provide: (key, value) => this.services.provide(key, value),
          resolve: (key) => this.services.resolve(key),
          contribute: (key, value) => {
            const entries = this.contributions.get(key.key) ?? [];
            entries.push({ moduleId: id, value });
            this.contributions.set(key.key, entries);
          },
          onStop: (dispose) => this.disposers.get(id)!.push(dispose),
        });
      }
      for (const module of ordered) await module.start?.();
      this.state = "running";
    } catch (error) {
      const cleanupErrors = await this.cleanup();
      this.state = "idle";
      if (cleanupErrors.length) throw new AggregateError([error, ...cleanupErrors], "Module startup and cleanup failed");
      throw error;
    }
  }

  async stop() {
    if (this.state === "idle") return;
    if (this.state !== "running") throw new Error(`Cannot stop registry while ${this.state}`);
    this.state = "stopping";
    const errors = await this.cleanup();
    this.state = "idle";
    if (errors.length) throw new AggregateError(errors, "Module shutdown failed");
  }

  private async cleanup() {
    const errors: unknown[] = [];
    for (const module of this.activated.reverse()) {
      try { await module.stop?.(); } catch (error) { errors.push(error); }
      for (const dispose of (this.disposers.get(module.metadata.id) ?? []).reverse()) {
        try { await dispose(); } catch (error) { errors.push(error); }
      }
    }
    this.activated = [];
    this.disposers.clear();
    this.services.clear();
    this.contributions.clear();
    return errors;
  }

  private orderEnabledModules() {
    const ordered: CenterifyModule[] = [];
    const visiting: string[] = [];
    const visited = new Set<string>();
    const visit = (id: string) => {
      const module = this.modules.get(id);
      if (!module) throw new Error(`Missing module dependency: ${id}`);
      if (!this.isEnabled(id)) throw new Error(`Disabled module dependency: ${id}`);
      if (visiting.includes(id)) throw new Error(`Circular module dependency: ${[...visiting, id].join(" -> ")}`);
      if (visited.has(id)) return;
      visiting.push(id);
      for (const dependency of module.metadata.dependsOn ?? []) visit(dependency);
      visiting.pop();
      visited.add(id);
      ordered.push(module);
    };
    for (const id of this.modules.keys()) if (this.isEnabled(id)) visit(id);
    return ordered;
  }
}
