# Creating a module

Start with `src/modules/example/index.ts`. Add application, domain, infrastructure and Discord directories only when the feature needs them. Core does not need to change.

## A complete business module

```ts
// src/modules/example/index.ts
import { serviceToken, type CenterifyModule } from "../../core/index.js";

export interface Greeting {
  say(name: string): string;
}
export const greetingToken = serviceToken<Greeting>("example.greeting");

export function createExampleModule(override?: Greeting): CenterifyModule {
  return {
    metadata: { id: "example", name: "Example", version: "1.0.0" },
    register(context) {
      const config = context.config;
      if (config !== undefined &&
          (!config || typeof config !== "object" || Array.isArray(config))) {
        throw new Error("example config must be an object");
      }
      const prefix = config && "prefix" in config ? config.prefix : "Hello";
      if (typeof prefix !== "string") throw new Error("example.prefix must be a string");
      context.provide(greetingToken, override ?? {
        say: (name) => `${prefix}, ${name}`,
      });
    },
  };
}
```

Use it without Discord, Prisma, Pino or bootstrap:

```ts
import { ModuleRegistry } from "./src/core/index.js";
import { createExampleModule, greetingToken } from "./src/modules/example/index.js";

const app = new ModuleRegistry();
app.register(createExampleModule(), { config: { prefix: "Welcome" } });
await app.start();
console.log(app.resolve(greetingToken).say("Ada")); // Welcome, Ada
await app.stop();
```

A factory creates fresh module state. Keep feature caches and timers in those instances rather than module-level maps. Tokens are shared public contracts; their values belong to each registry.

## Add a Discord command

Create `src/modules/example/discord/index.ts`:

```ts
import { Command } from "@sapphire/framework";
import { currentApplication } from "../../../adapters/discord/context.js";
import type { DiscordModule } from "../../../adapters/discord/modules.js";
import { greetingToken } from "../index.js";

export class HelloCommand extends Command {
  override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((command) => command
      .setName("hello")
      .setDescription("Say hello")
      .addStringOption((option) => option
        .setName("name")
        .setDescription("Name to greet")
        .setRequired(true)));
  }

  override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    const name = interaction.options.getString("name", true);
    const greeting = currentApplication().resolve(greetingToken);
    await interaction.reply({ content: greeting.say(name), allowedMentions: { parse: [] } });
  }
}

export const discordModule: DiscordModule = {
  commands: { hello: HelloCommand },
};
```

Compose it once at the application entrypoint:

```ts
import { createApplication } from "./src/bootstrap/application.js";
import { withDiscord } from "./src/adapters/discord/modules.js";
import { createExampleModule } from "./src/modules/example/index.js";

const app = createApplication({
  additionalModules: [withDiscord(createExampleModule(), async () =>
    (await import("./src/modules/example/discord/index.js")).discordModule)],
  modules: { example: { config: { prefix: "Welcome" } } },
});
```

Pass this registry to the normal Discord installation lifecycle (`app.start()`, `installDiscordModules(client, app)`, then `client.login`). In the shipped executable, add the module to the list in `bootstrap/application.ts`. Keep commands and event handlers inside the module; do not create top-level discovery directories. The loader registers contributions with Sapphire and applies the application context. Existing guild-ownership preconditions still apply.

For events, export `events: [discordEvent("messageCreate", handler)]` in the adapter definition. Keep Discord types in this directory and pass IDs, strings and plain values to business services. Register active component collectors with `trackCollector("example", collector)` from `adapters/discord/resources` so they stop with the module.

## Dependencies and communication

Declare `metadata.dependsOn: ["guilds"]` before resolving a service from that module. Import its token through `modules/guilds/index.ts`. An enabled module cannot start with a missing or disabled required dependency. The registry also rejects dependency cycles.

For an optional notification, use the event-bus contract:

```ts
import { eventsToken, type AppEvent } from "../../core/index.js";

export interface GreetingSent extends AppEvent {
  type: "example.greeting-sent";
  name: string;
}

// In a subscriber's register(context), declaring dependsOn: ["runtime"]:
const events = context.resolve(eventsToken);
context.onStop(events.subscribe<GreetingSent>("example.greeting-sent", (event) => {
  // Invoke the subscriber's own service with event.name.
}));
```

Keep event payload contracts in the feature that publishes them. Publishing awaits handlers and propagates errors. For required results, use a direct service call instead.

A host feature may export a typed contribution token and consume `app.extensions(token)`. Contributors use `context.contribute(token, implementation)`; Core does not need a new feature-specific registry.

## Storage and replacement

Define a repository interface inside the module at the boundary the use case needs. For example, a ticket use case might require `TicketRepository.create(input)` and `close(id)`. Implement the interface in `infrastructure/PrismaTicketRepository.ts` and pass that implementation to the module factory in bootstrap. Do not import a Prisma client into a command or an application service.

Use composition to override behavior:

```ts
const custom = createExampleModule({ say: (name) => `Good evening, ${name}` });
```

For existing features, `createApplication({ repositories: { moderation: replacement } })` replaces storage. `replacements: [module]` replaces a built-in with the same ID; provide the public tokens expected by its dependents. Pair a replacement business module with `withDiscord` if it should retain Discord entrypoints. `createApplication({ logger })` replaces Pino through the Core logger contract.

Community or Premium packages export the same `CenterifyModule` contract and can be passed through `additionalModules`. They use public APIs and declared dependencies; they do not modify another module's internals.

## Test without infrastructure

```ts
import { expect, test } from "vitest";
import { ModuleRegistry } from "../../src/core/index.js";
import { createExampleModule, greetingToken } from "../../src/modules/example/index.js";

test("supports a custom greeting implementation", async () => {
  const app = new ModuleRegistry();
  app.register(createExampleModule({ say: (name) => `Hi ${name}` }));
  await app.start();
  try {
    expect(app.resolve(greetingToken).say("Ada")).toBe("Hi Ada");
  } finally {
    await app.stop();
  }
});
```

Test application policy with fake repositories and effect ports. Put database integration checks in the integration suite, using `TEST_DATABASE_URL` and synthetic records. See `tests/modules/moderation/workflows.test.ts` for workflow tests that require neither Discord nor PostgreSQL.

## Disable or remove

Use `{ enabled: false }` for the module's registry options, or `CENTERIFY_MODULES='{"example":false}'` after adding it to the shipped composition. Restart the process for the selection to take effect. Its services, commands, listeners and jobs will not register. Disable any required dependents too.

To remove a module package, remove its composition entry and consumers of its public API. Feature-specific settings integrations belong to their feature/adapter layer; Core remains unchanged. Do not delete database migrations when removing a feature.

Run `npm run typecheck`, `npm test` and `npm run build`. Run the database scripts when storage changes. The architecture tests reject private cross-module imports, dependency cycles and framework or persistence imports in business code.
