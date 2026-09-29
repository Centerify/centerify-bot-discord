import "dotenv/config";
import { logger } from "./logger.js";

const [{ ApplicationCommandRegistries, LogLevel, RegisterBehavior, SapphireClient }, { GatewayIntentBits, Partials }] = await Promise.all(
  [import("@sapphire/framework"), import("discord.js")],
);

const token = process.env["DISCORD_TOKEN"];

if (!token) {
  throw new Error("Missing DISCORD_TOKEN in environment");
}

ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(RegisterBehavior.BulkOverwrite);

const client = new SapphireClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
  loadMessageCommandListeners: true,
  logger: { level: LogLevel.Info },
});

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  process.exit(1);
});

client.on("error", (error) => {
  logger.error({ err: error }, "Discord client error");
});

const shutdown = async (signal: NodeJS.Signals) => {
  logger.info({ signal }, "Shutting down Discord client");
  client.destroy();
  process.exit(0);
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

try {
  await client.login(token);
} catch (error) {
  logger.error({ err: error }, "Failed to login to Discord");
  process.exit(1);
}
