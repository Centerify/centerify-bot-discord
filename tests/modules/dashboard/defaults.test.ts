import { expect, test } from "vitest";
import { DashboardService } from "../../../src/dashboard/service.js";
import communityKit from "../../../plugins/community-kit/src/index.js";
import { memorySdk } from "../../helpers/betterTicket.js";
test("fresh dashboards have no implicitly installed extensions", () => {
  const application = { extensions: () => [], list: () => [] };
  const service = new DashboardService({} as never, application as never, {} as never, {} as never);
  expect(service.extensions()).toEqual([]);
  expect(service.pluginActions()).toEqual([]);
});
test("the example contributes only after an operator loads its explicit plugin factory", async () => {
  const { sdk } = memorySdk();
  const plugin = communityKit(sdk);
  expect(plugin.module.metadata.id).toBe("community-kit");
  expect(plugin.dashboard?.manifest.id).toBe("community-kit");
  // No factory call writes global installation or per-guild activation state.
  await expect(sdk.storage.read("222222222222222222")).resolves.toBeNull();
});
