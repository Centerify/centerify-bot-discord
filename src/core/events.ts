import { serviceToken } from "./container.js";
export interface AppEvent {
  type: string;
}

export interface EventBus {
  publish(event: AppEvent): Promise<void>;
  subscribe<T extends AppEvent>(type: string, handler: (event: T) => void | Promise<void>): () => void;
}

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<(event: AppEvent) => void | Promise<void>>>();

  subscribe<T extends AppEvent>(type: string, handler: (event: T) => void | Promise<void>) {
    const handlers = this.handlers.get(type) ?? new Set();
    handlers.add(handler as (event: AppEvent) => void | Promise<void>);
    this.handlers.set(type, handlers);
    return () => handlers.delete(handler as (event: AppEvent) => void | Promise<void>);
  }

  async publish(event: AppEvent) {
    for (const handler of this.handlers.get(event.type) ?? []) await handler(event);
  }
}

export const eventsToken = serviceToken<EventBus>("application.events");
