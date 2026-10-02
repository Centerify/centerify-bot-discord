import "dotenv/config";
import { Client } from "discord.js";
import { gatewayOptions } from "../dist/src/clientOptions.js";

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("Set DISCORD_TOKEN before running the Discord check.");
  process.exit(1);
}

// No Sapphire command loading, message listeners, or command registration runs
// here. This session only connects, reads the application commands, and exits.
const client = new Client({ ...gatewayOptions, rest: { timeout: 10_000, retries: 0 } });
client.on("error", (error) => { console.error(`Discord client error: ${error.message}`); });
let timer;
try {
  await Promise.race([
    client.login(token),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Discord Gateway did not become ready within 30 seconds.")), 30_000);
    }),
  ]);
  clearTimeout(timer);
  const commands = await client.application.commands.fetch();
  const names = [...commands.values()].map((command) => command.name).sort();
  const required = ["verify", "unverify", "setup", "settings", "custom", "xp"];
  const missingCommands = required.filter((name) => !names.includes(name));
  const serverCount = client.guilds.cache.size;
  console.log(JSON.stringify({
    gatewayConnected: client.isReady(),
    serverCount,
    multiServerInstallation: serverCount >= 2,
    registeredCommands: names,
    missingCommands,
  }, null, 2));
  if (missingCommands.length) {
    console.error("Start the built bot to register the missing slash commands.");
    process.exitCode = 1;
  }
  if (serverCount < 2) {
    console.error("Invite the bot to at least two servers to verify a multi-server installation.");
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`Discord check failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  await client.destroy();
}
