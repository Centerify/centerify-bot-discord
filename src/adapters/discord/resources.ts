import { serviceToken } from "../../core/index.js";
import { currentApplication } from "./context.js";

interface Collector {
  readonly ended?: boolean;
  stop(reason?: string): void;
  on(event: "end", listener: () => void): unknown;
}

/** Each Discord module owns its active interaction collectors. */
export class DiscordResources {
  private readonly collectors = new Set<Collector>();
  track<T extends Collector>(collector: T): T {
    this.collectors.add(collector);
    collector.on("end", () => this.collectors.delete(collector));
    return collector;
  }
  stop() {
    const errors: unknown[] = [];
    for (const collector of this.collectors) {
      try { if (!collector.ended) collector.stop("module-stopped"); } catch (error) { errors.push(error); }
    }
    this.collectors.clear();
    if (errors.length) throw new AggregateError(errors, "Discord collectors failed to stop");
  }
}
export const discordResourcesToken = serviceToken<DiscordResources>("discord.resources");
export function trackCollector<T extends Collector>(moduleId: string, collector: T): T {
  const resources = currentApplication().extensions(discordResourcesToken).find((entry) => entry.moduleId === moduleId)?.value;
  if (!resources) throw new Error(`Discord module is not registered: ${moduleId}`);
  return resources.track(collector);
}
