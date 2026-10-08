import { afterAll, afterEach, beforeAll, expect } from "vitest";
let application: import("../src/core/index.js").ModuleRegistry | undefined;
let stop: (() => Promise<void>) | undefined;
beforeAll(async () => {
  const path = expect.getState().testPath ?? "";
  if (/\/(integration|core|modules)\//.test(path)) return;
  const { startTestApplication } = await import("./helpers/application.js");
  ({ stop, application } = await startTestApplication());
});
afterAll(async () => { await stop?.(); });

afterEach(async () => {
  if (!application) return;
  const { discordResourcesToken } = await import("../src/adapters/discord/resources.js");
  for (const { value } of application.extensions(discordResourcesToken)) value.stop();
});
