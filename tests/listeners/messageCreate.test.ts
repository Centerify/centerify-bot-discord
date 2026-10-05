import { beforeEach, expect, test, vi } from "vitest";
import type { Message } from "discord.js";

const mocks = vi.hoisted(() => ({ verified: vi.fn(), award: vi.fn(), custom: vi.fn(), error: vi.fn() }));
vi.mock("../../src/services/guildOwnershipService.js", () => ({ guildOwnershipService: { isVerified: mocks.verified } }));
vi.mock("../../src/services/xpService.js", () => ({ xpService: { award: mocks.award } }));
vi.mock("../../src/services/customResponseRunner.js", () => ({ runCustomCommand: mocks.custom }));
vi.mock("../../src/logger.js", () => ({ logger: { error: mocks.error } }));

import { MessageCreateListener } from "../../src/listeners/messageCreate.js";

const listener = Object.create(MessageCreateListener.prototype) as MessageCreateListener;
const message = { guild: { id: "guild-a" }, author: { id: "member-a", bot: false }, webhookId: null, system: false };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.verified.mockResolvedValue(true);
});

test("verified guild messages award XP and run custom commands", async () => {
  await listener.run(message as unknown as Message);
  expect(mocks.award).toHaveBeenCalledWith("guild-a", "member-a");
  expect(mocks.custom).toHaveBeenCalledWith(message);
});

test("custom command delivery does not wait for XP storage", async () => {
  let finishXp!: () => void;
  mocks.award.mockReturnValue(new Promise<void>((resolve) => { finishXp = resolve; }));
  const running = listener.run(message as unknown as Message);
  try {
    await vi.waitFor(() => expect(mocks.custom).toHaveBeenCalledWith(message));
  } finally {
    finishXp();
    await running;
  }
});

test.each([
  { ...message, guild: null },
  { ...message, author: { ...message.author, bot: true } },
  { ...message, webhookId: "webhook" },
  { ...message, system: true },
])("ignores non-member messages", async (ignored) => {
  await listener.run(ignored as unknown as Message);
  expect(mocks.verified).not.toHaveBeenCalled();
  expect(mocks.award).not.toHaveBeenCalled();
  expect(mocks.custom).not.toHaveBeenCalled();
});

test("unverified guilds cannot earn XP or dispatch custom commands", async () => {
  mocks.verified.mockResolvedValue(false);
  await listener.run(message as unknown as Message);
  expect(mocks.award).not.toHaveBeenCalled();
  expect(mocks.custom).not.toHaveBeenCalled();
});

test("ownership check failures stop all automatic message actions", async () => {
  mocks.verified.mockRejectedValue(new Error("Database unavailable"));
  await expect(listener.run(message as unknown as Message)).resolves.toBeUndefined();
  expect(mocks.award).not.toHaveBeenCalled();
  expect(mocks.custom).not.toHaveBeenCalled();
  expect(mocks.error).toHaveBeenCalledOnce();
});

test("XP failures do not prevent custom commands in an authorized server", async () => {
  mocks.award.mockRejectedValue(new Error("XP unavailable"));
  await expect(listener.run(message as unknown as Message)).resolves.toBeUndefined();
  expect(mocks.custom).toHaveBeenCalledWith(message);
});

test("custom command errors are contained and logged", async () => {
  mocks.custom.mockRejectedValue(new Error("Missing Access"));
  await expect(listener.run(message as unknown as Message)).resolves.toBeUndefined();
  expect(mocks.error).toHaveBeenCalledOnce();
});
