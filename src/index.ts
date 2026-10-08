import "dotenv/config";
import { startBot } from "./bootstrap/start.js";
import { logger } from "./adapters/logging/pino.js";

try {
  const bot = await startBot();
  process.on("unhandledRejection", (reason) => logger.error({ err: reason }, "Unhandled promise rejection"));
  process.once("uncaughtException", (error) => {
    logger.fatal({ err: error }, "Uncaught exception");
    void bot.stop().catch((stopError) => logger.error({ err: stopError }, "Shutdown failed")).finally(() => { process.exitCode = 1; });
  });
  const shutdown = (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Shutting down Centerify");
    void bot.stop().catch((error) => { logger.error({ err: error }, "Shutdown failed"); process.exitCode = 1; });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
} catch (error) {
  logger.error({ err: error }, "Failed to start Centerify");
  process.exitCode = 1;
}
