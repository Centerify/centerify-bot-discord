import closeWithGrace from "close-with-grace";
import type { Logger } from "../core/index.js";

/** The package owns signals, rejections, repeated events and the shutdown deadline. */
export function installShutdown(bot: { stop(): Promise<void> }, logger: Logger, delay: number) {
  return closeWithGrace(
    {
      delay,
      logger: false,
      onTimeout: () => logger.error({ delay }, "Shutdown deadline exceeded"),
      onSecondError: (err) => logger.error({ err }, "Error during shutdown"),
      onSecondSignal: (signal) => logger.warn({ signal }, "Second shutdown signal received"),
    },
    async ({ err, signal }) => {
      if (err) logger.error({ err }, "Stopping Centerify after a fatal error");
      else logger.info({ signal }, "Shutting down Centerify");
      try {
        await bot.stop();
      } catch (error) {
        logger.error({ err: error }, "Shutdown cleanup failed");
        throw error;
      }
      if (err) throw err;
    },
  );
}
