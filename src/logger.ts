import pino from "pino";

export const logger = pino({
  name: "centerify-bot",
  level: process.env.LOG_LEVEL ?? "info",
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
    ],
    censor: "[redacted]",
  },

  transport:
    process.env.NODE_ENV !== "production"
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
