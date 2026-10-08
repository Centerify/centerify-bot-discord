import { withApplication } from "../adapters/discord/context.js";
import { ApplicationCommandRegistries, LogLevel, RegisterBehavior, SapphireClient } from "@sapphire/framework";
import { parseModuleConfiguration } from "../core/index.js";
import { gatewayOptions } from "../adapters/discord/clientOptions.js";
import { installDiscordModules } from "../adapters/discord/modules.js";
import { createApplication } from "./application.js";
import { db } from "../adapters/prisma/client.js";
import { logger } from "../adapters/logging/pino.js";

export async function startBot() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error("Missing DISCORD_TOKEN in environment");
  if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL in environment");
  ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(RegisterBehavior.BulkOverwrite);
  const client = new SapphireClient({ ...gatewayOptions, baseUserDirectory: null, loadMessageCommandListeners: true, logger: { level: LogLevel.Info } });
  const application = createApplication({ modules: parseModuleConfiguration(process.env.CENTERIFY_MODULES) });
  let removeAdapters: (() => Promise<void>) | undefined;
  let stopping: Promise<void> | undefined;
  const stop = () => stopping ??= (async () => {
    const errors: unknown[] = [];
    for (const close of [() => client.destroy(), () => removeAdapters?.(), () => withApplication(application, () => application.stop()), () => db.close()]) {
      try { await close(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "Application shutdown failed");
  })();
  client.on("error", (error) => logger.error({ err: error }, "Discord client error"));
  try {
    await application.start();
    removeAdapters = await installDiscordModules(client, application);
    await client.login(token);
  } catch (error) {
    try { await stop(); } catch (cleanupError) { logger.error({ err: cleanupError }, "Startup cleanup failed"); }
    throw error;
  }
  return { client, application, stop };
}
