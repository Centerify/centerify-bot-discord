import { beforeEach, expect, test, vi } from "vitest";
import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";

const mocks = vi.hoisted(() => ({ check: vi.fn(), warn: vi.fn() }));
vi.mock("../../src/adapters/logging/runtime.js", () => ({
  logger: { warn: mocks.warn },
}));
vi.mock("../../src/modules/guilds/discord/ownership.js", () => ({
  guildOwnershipService: {},
  OWNERSHIP_REQUIRED_MESSAGE: "Verification required",
  requireVerifiedOwnership: mocks.check,
}));
import { VerifiedGuildOwnershipPrecondition } from "../../src/modules/guilds/discord/index.js";

const precondition = Object.create(
  VerifiedGuildOwnershipPrecondition.prototype,
) as VerifiedGuildOwnershipPrecondition;
beforeEach(() => vi.resetAllMocks());

test.each(["settings", "setup", "custom"])(
  "%s acknowledgement completes before slow ownership checks start",
  async (commandName) => {
    let acknowledged = false;
    const interaction = {
      commandName,
      deferred: false,
      replied: false,
      deferReply: vi.fn(async () => {
        acknowledged = true;
      }),
    };
    mocks.check.mockImplementation(async () => {
      expect(acknowledged).toBe(true);
      return true;
    });
    const result = await precondition.chatInputRun(
      interaction as unknown as ChatInputCommandInteraction,
    );
    expect(result.isOk()).toBe(true);
    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
  },
);

test.each(["settings", "setup", "custom"])(
  "an acknowledged %s interaction is not deferred twice",
  async (commandName) => {
    mocks.check.mockResolvedValue(true);
    const interaction = {
      commandName,
      deferred: true,
      replied: false,
      deferReply: vi.fn(),
    };
    await precondition.chatInputRun(
      interaction as unknown as ChatInputCommandInteraction,
    );
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(mocks.check).toHaveBeenCalledOnce();
  },
);

test("verify bypasses ownership checks without precondition acknowledgement", async () => {
  const interaction = { commandName: "verify", deferReply: vi.fn() };
  const result = await precondition.chatInputRun(
    interaction as unknown as ChatInputCommandInteraction,
  );
  expect(result.isOk()).toBe(true);
  expect(mocks.check).not.toHaveBeenCalled();
  expect(interaction.deferReply).not.toHaveBeenCalled();
});

test("unverify remains available after verification is removed", async () => {
  const interaction = { commandName: "unverify", deferReply: vi.fn() };
  const result = await precondition.chatInputRun(
    interaction as unknown as ChatInputCommandInteraction,
  );
  expect(result.isOk()).toBe(true);
  expect(mocks.check).not.toHaveBeenCalled();
  expect(interaction.deferReply).not.toHaveBeenCalled();
});

test.each(["settings", "setup", "custom"])(
  "expired %s interactions stop before ownership requests",
  async (commandName) => {
    const apiError = Object.assign(new Error("Unknown interaction"), {
      code: 10062,
      url: "https://discord.com/api/v10/interactions/private-token/callback",
    });
    const startedAt = Date.now();
    const interaction = {
      commandName,
      id: "interaction",
      guildId: "guild",
      createdTimestamp: startedAt - 3500,
      deferred: false,
      replied: false,
      deferReply: vi.fn().mockRejectedValue(apiError),
      reply: vi.fn(),
      editReply: vi.fn(),
      followUp: vi.fn(),
    };
    const result = await precondition.chatInputRun(
      interaction as unknown as ChatInputCommandInteraction,
    );
    expect(result.isErr()).toBe(true);
    expect(result.unwrapErr().identifier).toBe("InteractionUnavailable");
    expect(mocks.check).not.toHaveBeenCalled();
    expect(interaction.deferReply).toHaveBeenCalledOnce();
    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.editReply).not.toHaveBeenCalled();
    expect(interaction.followUp).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 10062,
        commandName,
        interactionId: "interaction",
        guildId: "guild",
        interactionAgeMs: expect.any(Number),
        acknowledgementDurationMs: expect.any(Number),
      }),
      expect.any(String),
    );
    expect(mocks.warn.mock.calls[0][0].interactionAgeMs).toBeGreaterThanOrEqual(
      3500,
    );
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain(
      "private-token",
    );
  },
);

test("a callback acknowledged elsewhere also stops execution", async () => {
  const interaction = {
    commandName: "custom",
    createdTimestamp: Date.now(),
    deferred: false,
    replied: false,
    deferReply: vi.fn().mockRejectedValue({ code: 40060 }),
  };
  const result = await precondition.chatInputRun(
    interaction as unknown as ChatInputCommandInteraction,
  );
  expect(result.isErr()).toBe(true);
  expect(mocks.check).not.toHaveBeenCalled();
  expect(mocks.warn).toHaveBeenCalledWith(
    expect.objectContaining({ code: 40060 }),
    expect.any(String),
  );
});

test.each([new Error("Connection failed"), { code: 50013 }])(
  "unexpected acknowledgement errors remain visible",
  async (error) => {
    const interaction = {
      commandName: "custom",
      deferred: false,
      replied: false,
      deferReply: vi.fn().mockRejectedValue(error),
    };
    await expect(
      precondition.chatInputRun(
        interaction as unknown as ChatInputCommandInteraction,
      ),
    ).rejects.toBe(error);
    expect(mocks.check).not.toHaveBeenCalled();
    expect(mocks.warn).not.toHaveBeenCalled();
  },
);
