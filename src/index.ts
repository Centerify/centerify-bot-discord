import "dotenv/config";
import pino from "pino";

const [{ LogLevel, SapphireClient }, { GatewayIntentBits }] = await Promise.all(
  [import("@sapphire/framework"), import("discord.js")],
);

const logger = pino({ name: "centerify-bot" });

const token = process.env["DISCORD_TOKEN"];

if (!token) {
  throw new Error("Missing DISCORD_TOKEN in environment");
}

const client = new SapphireClient({
  intents: [GatewayIntentBits.Guilds],
  loadMessageCommandListeners: true,
  logger: { level: LogLevel.Info },
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
  logger.error({ error }, "Failed to login to Discord");
  process.exit(1);
}
