import pino from "pino";
import { serializeError } from "./errors.js";
import { parseLoggingConfiguration } from "./config.js";

const config = parseLoggingConfiguration();

export const logger = pino({
  name: "centerify-bot",
  level: config.level,
  serializers: { err: serializeError },
  redact: {
    paths: [
      "DISCORD_TOKEN",
      "DATABASE_URL",
      "*.DISCORD_TOKEN",
      "*.DATABASE_URL",
      "*.token",
      "*.password",
      "*.authorization",
      "*.headers.authorization",
      "err.config.headers.Authorization",
      "err.url",
    ],
    censor: "[redacted]",
  },

  transport:
    config.format === "pretty"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
            singleLine: false,
          },
        }
      : undefined,
});
