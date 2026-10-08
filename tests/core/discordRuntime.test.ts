import { SapphireClient } from "@sapphire/framework";
import { expect, test, vi } from "vitest";
import { ModuleRegistry, loggerToken, silentLogger, type CenterifyModule } from "../../src/core/index.js";
import { createApplication } from "../../src/bootstrap/application.js";
import { discordEvent, dispatchDiscordEvent, installDiscordModules, withDiscord } from "../../src/adapters/discord/modules.js";
import { withApplication } from "../../src/adapters/discord/context.js";
import { settingsActionAvailable } from "../../src/modules/settings/discord/availability.js";

function client() { return new SapphireClient({ intents: [], baseUserDirectory: null, loadDefaultErrorListeners: false }); }

test("the explicit loader installs existing commands and omits every disabled module contribution", async () => {
  const discord = client();
  const app = createApplication({ logger: silentLogger, modules: {
    moderation: { enabled: false }, xp: { enabled: false }, welcome: { enabled: false }, "custom-commands": { enabled: false },
  } });
  await app.start();
  const remove = await installDiscordModules(discord, app);
  await discord.stores.get("preconditions").loadAll();
  await discord.stores.get("commands").loadAll();
  try {
    expect([...discord.stores.get("commands").keys()].sort()).toEqual(["help", "info", "ping", "server", "settings", "setup", "status", "unverify", "verify"]);
    expect(discord.listenerCount("messageCreate")).toBe(0);
    expect(discord.listenerCount("guildMemberAdd")).toBe(0);
    withApplication(app, () => {
      expect(settingsActionAvailable("xp-rewards")).toBe(false);
      expect(settingsActionAvailable("welcome-edit")).toBe(false);
      expect(settingsActionAvailable("custom-commands")).toBe(false);
      expect(settingsActionAvailable("finish")).toBe(true);
    });
  } finally { await remove(); await app.stop(); await discord.destroy(); }
});

test("all existing commands are installed with the default modules without logging in", async () => {
  const discord = client();
  const app = createApplication({ logger: silentLogger });
  await app.start();
  const remove = await installDiscordModules(discord, app);
  await discord.stores.get("preconditions").loadAll();
  await discord.stores.get("commands").loadAll();
  try {
    expect(discord.stores.get("commands").size).toBe(23);
    expect(discord.listenerCount("messageCreate")).toBe(1);
    expect(discord.listenerCount("messageReactionAdd")).toBe(1);
    expect(discord.stores.get("preconditions").has("verifiedGuildOwnership")).toBe(true);
  } finally { await remove(); await app.stop(); await discord.destroy(); }
});

test("separate registries isolate events and tolerate a failing sibling handler", async () => {
  const calls: string[] = [];
  const error = vi.fn();
  const app = new ModuleRegistry().register({ metadata: { id: "runtime", name: "runtime", version: "1" }, register(ctx) { ctx.provide(loggerToken, { ...silentLogger, error }); } });
  const other = new ModuleRegistry();
  const module: CenterifyModule = { metadata: { id: "example", name: "Example", version: "1" }, register() {} };
  app.register(withDiscord(module, async () => ({ events: [
    discordEvent("debug", async () => { throw new Error("failed"); }),
    discordEvent("debug", async () => { calls.push("independent"); }),
    discordEvent("debug", async () => { calls.push("after"); }, 1),
  ] })));
  await app.start();
  await other.start();
  try {
    await dispatchDiscordEvent(other, "debug", "test");
    expect(calls).toEqual([]);
    await dispatchDiscordEvent(app, "debug", "test");
    expect(calls).toEqual(["independent", "after"]);
    expect(error).toHaveBeenCalledOnce();
  } finally { await app.stop(); await other.stop(); }
});

test("Discord decoration preserves a module's own lifecycle receiver", async () => {
  class Example implements CenterifyModule {
    metadata = { id: "example", name: "Example", version: "1" };
    starts = 0;
    stops = 0;
    register() {}
    start() { this.starts += 1; }
    stop() { this.stops += 1; }
  }
  const example = new Example();
  const app = new ModuleRegistry().register({ metadata: { id: "runtime", name: "Runtime", version: "1" }, register() {} });
  app.register(withDiscord(example, async () => ({})));
  await app.start();
  await app.stop();
  expect([example.starts, example.stops]).toEqual([1, 1]);
});
