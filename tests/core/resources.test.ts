import { EventEmitter } from "node:events";
import { expect, test, vi } from "vitest";
import { DiscordResources } from "../../src/adapters/discord/resources.js";

test("module resources release live collectors and forget ended collectors", () => {
  const resources = new DiscordResources();
  const collector = Object.assign(new EventEmitter(), { stop: vi.fn() });
  const ended = Object.assign(new EventEmitter(), { stop: vi.fn() });
  resources.track(collector);
  resources.track(ended);
  ended.emit("end");
  resources.stop();
  resources.stop();
  expect(collector.stop).toHaveBeenCalledExactlyOnceWith("module-stopped");
  expect(ended.stop).not.toHaveBeenCalled();
});
