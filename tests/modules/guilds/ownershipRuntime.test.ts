import { afterEach, expect, test, vi } from "vitest";
import { MessageFlags } from "discord.js";
import {
  guildOwnershipService,
  OWNERSHIP_REQUIRED_MESSAGE,
  requireVerifiedOwnership,
} from "../../../src/modules/guilds/discord/ownership.js";
afterEach(() => vi.restoreAllMocks());
function fixture(component: boolean, ephemeral: boolean) {
  return {
    guild: {},
    deferred: true,
    replied: false,
    ephemeral,
    isMessageComponent: () => component,
    followUp: vi.fn(),
    editReply: vi.fn(),
    deleteReply: vi.fn(),
    reply: vi.fn(),
  };
}
test("lost ownership on a component reports privately and preserves its settings panel", async () => {
  vi.spyOn(guildOwnershipService, "isVerified").mockResolvedValue(false);
  const interaction = fixture(true, false);
  expect(await requireVerifiedOwnership(interaction as never)).toBe(false);
  expect(interaction.followUp).toHaveBeenCalledWith({
    content: OWNERSHIP_REQUIRED_MESSAGE,
    flags: MessageFlags.Ephemeral,
  });
  expect(interaction.editReply).not.toHaveBeenCalled();
  expect(interaction.deleteReply).not.toHaveBeenCalled();
});
test("an unverified public slash command replaces its placeholder with a private denial", async () => {
  vi.spyOn(guildOwnershipService, "isVerified").mockResolvedValue(false);
  const interaction = fixture(false, false);
  expect(await requireVerifiedOwnership(interaction as never)).toBe(false);
  expect(interaction.followUp).toHaveBeenCalledWith({
    content: OWNERSHIP_REQUIRED_MESSAGE,
    flags: MessageFlags.Ephemeral,
  });
  expect(interaction.deleteReply).toHaveBeenCalledOnce();
  expect(interaction.editReply).not.toHaveBeenCalled();
});
test("an unverified private command completes its deferred reply", async () => {
  vi.spyOn(guildOwnershipService, "isVerified").mockResolvedValue(false);
  const interaction = fixture(false, true);
  expect(await requireVerifiedOwnership(interaction as never)).toBe(false);
  expect(interaction.editReply).toHaveBeenCalledWith({ content: OWNERSHIP_REQUIRED_MESSAGE });
  expect(interaction.followUp).not.toHaveBeenCalled();
});
