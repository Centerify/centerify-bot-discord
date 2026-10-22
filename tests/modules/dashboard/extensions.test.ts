import { z } from "zod";
import { communityExtension } from "../../../plugins/community-kit/src/index.js";
const communityKit = communityExtension(z);
import { expect, test, vi } from "vitest";
import { dashboardExtensionSchema, validateExtensions } from "../../../src/dashboard/extensions.js";
test("extension manifests reject unsupported APIs and undeclared capabilities", () => {
  expect(() =>
    dashboardExtensionSchema.parse({ ...communityKit.manifest, dashboardApi: 2 }),
  ).toThrow();
  expect(() =>
    validateExtensions(
      [
        {
          ...communityKit,
          manifest: { ...communityKit.manifest, capabilities: ["dashboard.widget"] },
        },
      ],
      new Set(["guilds"]),
    ),
  ).toThrow("capabilities");
  expect(() => validateExtensions([communityKit], new Set())).toThrow("dependencies");
  expect(() => validateExtensions([communityKit, communityKit], new Set(["guilds"]))).toThrow(
    "Duplicate",
  );
});
test("example extension validates settings and responds through its allowlisted port", async () => {
  const respond = vi.fn(async () => {});
  await communityKit.execute("greeting", {
    config: { greeting: "Hello community" },
    text: "",
    respond,
  });
  expect(respond).toHaveBeenCalledWith("Hello community");
  await expect(communityKit.execute("shell", { config: {}, text: "", respond })).rejects.toThrow(
    "Unknown",
  );
  expect(() => communityKit.settings.parse({ greeting: "hello", token: "secret" })).toThrow();
});
