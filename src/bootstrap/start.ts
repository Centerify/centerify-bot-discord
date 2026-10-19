import { withApplication } from "../adapters/discord/context.js";
import {
  ApplicationCommandRegistries,
  LogLevel,
  RegisterBehavior,
  SapphireClient,
} from "@sapphire/framework";
import { parseEnvironment, type EnvironmentConfiguration } from "./config.js";
import { gatewayOptions } from "../adapters/discord/clientOptions.js";
import { installDiscordModules } from "../adapters/discord/modules.js";
import { createApplication } from "./application.js";
import { db } from "../adapters/prisma/client.js";
import { logger } from "../adapters/logging/pino.js";
import { defaultPluginManager, loadInstalledPlugins } from "./plugins.js";
import { applyBotIdentity, configuredPresence } from "../adapters/discord/configuration.js";
import { Events } from "discord.js";

export async function startBot(config: EnvironmentConfiguration = parseEnvironment()) {
  if (config.customization.startup.enabled === false)
    throw new Error("Bot startup is disabled in configuration");
  ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(RegisterBehavior.BulkOverwrite);
  ApplicationCommandRegistries.setDefaultGuildIds(config.customization.startup.commandGuildIds);
  ApplicationCommandRegistries.setBulkOverwriteRetries(
    config.customization.startup.commandRegistrationRetries ?? null,
  );
  const pluginManager = defaultPluginManager(config.pluginStateDirectory);
  const installedPlugins = await loadInstalledPlugins(pluginManager);
  const client = new SapphireClient({
    ...gatewayOptions,
    baseUserDirectory: null,
    loadMessageCommandListeners: true,
    logger: { level: LogLevel.Info },
    presence: configuredPresence(config.customization.bot),
  });
  const application = createApplication({
    modules: config.modules,
    bot: config.customization.bot,
    pluginManager,
    additionalModules: installedPlugins,
  });
  let removeAdapters: (() => Promise<void>) | undefined;
  let stopping: Promise<void> | undefined;
  const stop = () =>
    (stopping ??= (async () => {
      const errors: unknown[] = [];
      for (const close of [
        () => client.destroy(),
        () => removeAdapters?.(),
        () => withApplication(application, () => application.stop()),
        () => db.close(),
      ]) {
        try {
          await close();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors, "Application shutdown failed");
    })());
  client.on("error", (error) => logger.error({ err: error }, "Discord client error"));
  try {
    await application.start();
    removeAdapters = await installDiscordModules(
      client,
      application,
      config.customization.commands,
    );
    let onReady: (ready: SapphireClient<true>) => void;
    const identityReady = new Promise<void>((resolve, reject) => {
      onReady = (ready) => {
        void applyBotIdentity(ready, config.customization.bot).then(resolve, reject);
      };
      client.once(Events.ClientReady, onReady);
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const connected = Promise.all([client.login(config.discordToken), identityReady]);
      if (config.customization.startup.loginTimeoutMs === undefined) await connected;
      else
        await Promise.race([
          connected,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("Bot login timed out")),
              config.customization.startup.loginTimeoutMs,
            );
          }),
        ]);
    } finally {
      clearTimeout(timer);
      client.off(Events.ClientReady, onReady!);
    }
  } catch (error) {
    try {
      await stop();
    } catch (cleanupError) {
      logger.error({ err: cleanupError }, "Startup cleanup failed");
    }
    throw error;
  }
  return { client, application, stop };
}
