import "dotenv/config";
import { parseEnvironment } from "../src/bootstrap/config.js";

try {
  const config = parseEnvironment();
  console.log(
    `Configuration is valid. Logging: ${config.logging.format}/${config.logging.level}. Shutdown timeout: ${config.shutdownTimeoutMs} ms.`,
  );
  console.log(
    `Module overrides: ${Object.keys(config.modules).join(", ") || "none (all enabled)"}.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Invalid configuration");
  process.exitCode = 1;
}
