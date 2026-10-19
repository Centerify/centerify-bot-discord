import "dotenv/config";
import { parseEnvironment } from "./bootstrap/config.js";

let startupLogger: typeof import("./adapters/logging/pino.js").logger | undefined;

try {
  const config = parseEnvironment();
  const [{ startBot }, { logger }, { installShutdown }] = await Promise.all([
    import("./bootstrap/start.js"),
    import("./adapters/logging/pino.js"),
    import("./bootstrap/lifecycle.js"),
  ]);
  startupLogger = logger;
  const bot = await startBot(config);
  installShutdown(bot, logger, config.shutdownTimeoutMs);
} catch (error) {
  if (startupLogger) startupLogger.error({ err: error }, "Failed to start Centerify");
  else console.error(error instanceof Error ? error.message : "Failed to read configuration");
  process.exitCode = 1;
}
