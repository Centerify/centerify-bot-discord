import {
  Events,
  SapphireClient,
  type ChatInputCommand,
} from "@sapphire/framework";
import { once } from "node:events";
import { expect, test, vi } from "vitest";
import { silentLogger } from "../../src/core/index.js";
import { createApplication } from "../../src/bootstrap/application.js";
import { installDiscordModules } from "../../src/adapters/discord/modules.js";

test("Sapphire denies an expired interaction without running the command or emitting a listener error", async () => {
  const discord = new SapphireClient({
    intents: [],
    baseUserDirectory: null,
    loadDefaultErrorListeners: false,
  });
  const warn = vi.fn();
  const app = createApplication({
    logger: { ...silentLogger, warn },
    modules: {
      moderation: { enabled: false },
      xp: { enabled: false },
      welcome: { enabled: false },
      "custom-commands": { enabled: false },
    },
  });
  await app.start();
  const remove = await installDiscordModules(discord, app);
  await discord.stores.get("preconditions").loadAll();
  await discord.stores.get("commands").loadAll();
  await discord.stores.get("listeners").loadAll();
  const listenerError = vi.fn();
  discord.on(Events.ListenerError, listenerError);
  try {
    const command = discord.stores
      .get("commands")
      .get("settings")! as ChatInputCommand;
    const run = vi.spyOn(command, "chatInputRun");
    const interaction = {
      commandName: "settings",
      id: "interaction",
      guildId: "guild",
      createdTimestamp: Date.now() - 3500,
      deferred: false,
      replied: false,
      deferReply: vi.fn().mockRejectedValue({ code: 10062 }),
      reply: vi.fn(),
    };
    expect(discord.listenerCount(Events.PreChatInputCommandRun)).toBe(1);
    const denied = once(discord, Events.ChatInputCommandDenied);
    discord.emit(Events.PreChatInputCommandRun, {
      command,
      interaction: interaction as never,
      context: { commandName: "settings", commandId: "command" },
    });
    const [error] = await denied;
    expect(error.identifier).toBe("InteractionUnavailable");
    expect(run).not.toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();
    expect(listenerError).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  } finally {
    discord.off(Events.ListenerError, listenerError);
    await remove();
    await app.stop();
    await discord.destroy();
  }
});
