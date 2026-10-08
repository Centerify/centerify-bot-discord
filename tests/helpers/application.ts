import { SapphireClient } from "@sapphire/framework";
import { silentLogger } from "../../src/core/index.js";
import { bindApplication } from "../../src/adapters/discord/context.js";

export async function startTestApplication() {
  const { createApplication } = await import("../../src/bootstrap/application.js");
  const client = new SapphireClient({ intents: [], baseUserDirectory: null, loadDefaultErrorListeners: false });
  const application = createApplication({ logger: silentLogger });
  await application.start();
  const unbind = bindApplication(client, application);
  return { application, client, async stop() { await application.stop(); unbind(); await client.destroy(); } };
}
