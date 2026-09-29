import { beforeEach, expect, test, vi } from "vitest";
import type { MessageReaction, User } from "discord.js";
const mocks = vi.hoisted(() => ({ verified: vi.fn(), award: vi.fn(), error: vi.fn() }));
vi.mock("../../src/services/guildOwnershipService.js", () => ({ guildOwnershipService: { isVerified: mocks.verified } }));
vi.mock("../../src/services/xpService.js", () => ({ xpService: { award: mocks.award } }));
vi.mock("../../src/logger.js", () => ({ logger: { error: mocks.error } }));
import { MessageReactionAddListener } from "../../src/listeners/messageReactionAdd.js";
const listener = Object.create(MessageReactionAddListener.prototype) as MessageReactionAddListener;
const message = { partial: false, guild: { id: "server" }, author: { id: "author", bot: false }, webhookId: null, system: false };
const user = { partial: false, id: "reactor", bot: false };

beforeEach(() => { vi.clearAllMocks(); mocks.verified.mockResolvedValue(true); });

test("reaction XP goes to the member adding the reaction", async () => {
  await listener.run({ message } as unknown as MessageReaction, user as User);
  expect(mocks.award).toHaveBeenCalledWith("server", "reactor", "reactions");
});

test("self, bot, webhook, system, DM, and unverified reactions earn no XP", async () => {
  for (const variant of [
    { message, user: { ...user, id: "author" } },
    { message, user: { ...user, bot: true } },
    { message: { ...message, author: { ...message.author, bot: true } }, user },
    { message: { ...message, webhookId: "webhook" }, user },
    { message: { ...message, system: true }, user },
    { message: { ...message, guild: null }, user },
  ]) await listener.run({ message: variant.message } as unknown as MessageReaction, variant.user as User);
  mocks.verified.mockResolvedValue(false);
  await listener.run({ message } as unknown as MessageReaction, user as User);
  expect(mocks.award).not.toHaveBeenCalled();
});

test("uncached reaction messages are fetched before awarding", async () => {
  const fetch = vi.fn().mockResolvedValue(message);
  await listener.run({ message: { partial: true, fetch } } as unknown as MessageReaction, user as User);
  expect(fetch).toHaveBeenCalledOnce();
  expect(mocks.award).toHaveBeenCalledOnce();
});

test("fetch failures are logged and do not award XP", async () => {
  const fetch = vi.fn().mockRejectedValue(new Error("Missing Access"));
  await listener.run({ message: { partial: true, fetch } } as unknown as MessageReaction, user as User);
  expect(mocks.error).toHaveBeenCalledOnce();
  expect(mocks.award).not.toHaveBeenCalled();
});
