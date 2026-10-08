import { describe, expect, test, vi } from "vitest";
import { PermissionFlagsBits, PermissionsBitField } from "discord.js";
vi.mock("../../../src/adapters/logging/runtime.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));
import { CustomCommandPermissionService } from "../../../src/modules/custom-commands/discord/CustomCommandPermissionService.js";
import { CustomCommandCooldownService } from "../../../src/modules/custom-commands/application/CustomCommandCooldownService.js";
import { CustomCommandExecutor } from "../../../src/modules/custom-commands/discord/CustomCommandExecutor.js";
import {
  CHANNEL,
  context,
  MemoryRepository,
  record,
  ROLE,
} from "./fixtures.js";
const permissions = new CustomCommandPermissionService();
describe("permission priority and isolation", () => {
  test("allowed roles/channels permit access with channel permissions", () => {
    expect(() =>
      permissions.check(
        context({
          command: record({
            allowedRoleIds: [ROLE],
            allowedChannelIds: [CHANNEL],
          }),
        }),
      ),
    ).not.toThrow();
  });
  test.each([
    [{ enabled: false }, "disabled"],
    [
      { deniedChannelIds: [CHANNEL], allowedChannelIds: [CHANNEL] },
      "denied in this channel",
    ],
    [{ allowedChannelIds: ["other"] }, "restricted to other channels"],
    [{ deniedRoleIds: [ROLE], allowedRoleIds: [ROLE] }, "roles are denied"],
    [{ allowedRoleIds: ["other"] }, "allowed role"],
    [
      { requiredUserPermissions: ["BanMembers"] },
      "required Discord permissions",
    ],
    [{ requiredBotPermissions: ["BanMembers"] }, "I lack"],
    [{ guildId: "guild-b" }, "another server"],
    [{ triggerType: "SLASH" }, "trigger"],
  ])("rejects restricted commands %#", (patch, message) => {
    expect(() =>
      permissions.check(
        context({ command: record(patch as Parameters<typeof record>[0]) }),
      ),
    ).toThrow(message);
  });
  test("checks channel overwrites instead of guild-level permission grants", () => {
    const c = context();
    c.command.requiredUserPermissions = ["ManageMessages"];
    vi.spyOn(c.channel, "permissionsFor").mockReturnValue(
      new PermissionsBitField(PermissionFlagsBits.ViewChannel),
    );
    expect(() => permissions.check(c)).toThrow("You lack");
  });
  test("disabled/channel denials precede roles and Discord permission denials", () => {
    const c = context({
      command: record({
        enabled: false,
        deniedChannelIds: [CHANNEL],
        deniedRoleIds: [ROLE],
      }),
    });
    expect(() => permissions.check(c)).toThrow("disabled");
    c.command.enabled = true;
    expect(() => permissions.check(c)).toThrow("denied in this channel");
    c.command.deniedChannelIds = [];
    expect(() => permissions.check(c)).toThrow("roles are denied");
  });
  test("requires bot send, embed, deletion and thread-specific permissions", () => {
    for (const [permission, patch, thread] of [
      [PermissionFlagsBits.SendMessages, {}, false],
      [
        PermissionFlagsBits.EmbedLinks,
        {
          responseType: "EMBED",
          content: [{ type: "EMBED", embed: { title: "t" } }],
        },
        false,
      ],
      [PermissionFlagsBits.ManageMessages, { deleteInvocation: true }, false],
      [PermissionFlagsBits.SendMessagesInThreads, {}, true],
    ] as const) {
      const c = context({
        command: record(patch as Parameters<typeof record>[0]),
      });
      const granted = new PermissionsBitField([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageMessages,
      ]);
      granted.remove(permission);
      vi.spyOn(c.channel, "permissionsFor").mockReturnValue(granted);
      vi.spyOn(c.channel, "isThread").mockReturnValue(thread as never);
      expect(() => permissions.check(c)).toThrow("I lack");
    }
  });
  test("mismatched member, channel or user contexts fail closed", () => {
    for (const patch of [
      { channelId: "other" },
      { userId: "other" },
      { guildId: "other" },
    ])
      expect(() => permissions.check(context(patch))).toThrow("another server");
  });
});

describe("scoped bounded cooldown reservations", () => {
  test.each(["USER", "CHANNEL", "GUILD", "GLOBAL_COMMAND"] as const)(
    "scope %s expires and stays guild-local",
    (scope) => {
      let now = 1000;
      const cooldowns = new CustomCommandCooldownService(() => now);
      const c = context({
        command: record({ cooldownScope: scope, cooldownSeconds: 10 }),
      });
      cooldowns.acquire(c);
      expect(() => cooldowns.acquire(c)).toThrow("10 seconds");
      const otherUser = { ...c, userId: "other-user" };
      const otherChannel = { ...c, channelId: "other-channel" };
      if (scope === "USER")
        expect(() => cooldowns.acquire(otherUser)).not.toThrow();
      else expect(() => cooldowns.acquire(otherUser)).toThrow();
      if (scope === "USER" || scope === "CHANNEL")
        expect(() =>
          cooldowns.acquire({ ...otherChannel, userId: "new" }),
        ).not.toThrow();
      else expect(() => cooldowns.acquire(otherChannel)).toThrow();
      expect(() =>
        cooldowns.acquire({
          ...c,
          guildId: "guild-b",
          command: { ...c.command, guildId: "guild-b" },
        }),
      ).not.toThrow();
      now += 10_000;
      expect(() => cooldowns.acquire(c)).not.toThrow();
    },
  );
  test("an old failed execution cannot release a newer reservation", () => {
    let now = 1000;
    const store = new CustomCommandCooldownService(() => now);
    const c = context({ command: record({ cooldownSeconds: 1 }) });
    const releaseOld = store.acquire(c);
    now += 1000;
    store.acquire(c);
    releaseOld();
    expect(() => store.acquire(c)).toThrow();
  });
  test("zero cooldown has no allocation; sweeps expiration and bounds live memory", () => {
    let now = 1000;
    const store = new CustomCommandCooldownService(() => now, 1);
    store.acquire(context());
    expect(store.size).toBe(0);
    const c = context({ command: record({ cooldownSeconds: 1 }) });
    store.acquire(c);
    expect(() => store.acquire({ ...c, userId: "other" })).toThrow("capacity");
    now += 1000;
    store.sweep();
    expect(store.size).toBe(0);
    expect(() => store.acquire({ ...c, userId: "other" })).not.toThrow();
  });
});

describe("canonical execution flow", () => {
  test("message/slash paths use the same renderer, permissions, cooldown and usage path", async () => {
    const repo = new MemoryRepository();
    const executor = new CustomCommandExecutor(repo);
    const send = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    const c = context({
      command: record({
        deleteInvocation: true,
        responseType: "MULTI",
        content: [
          { type: "TEXT", text: "First {user.name}" },
          { type: "TEXT", text: "Second" },
        ],
      }),
    });
    await executor.execute(c, { send, deleteInvocation: remove });
    expect(send.mock.calls.map((call) => [call[0].content, call[1]])).toEqual([
      ["First Alex", 0],
      ["Second", 1],
    ]);
    expect(remove).toHaveBeenCalledOnce();
    await executor.execute(
      { ...c, source: "slash" },
      { send, deleteInvocation: remove },
    );
    expect(send).toHaveBeenCalledTimes(4);
    expect(remove).toHaveBeenCalledOnce();
    expect(repo.recordUsage).toHaveBeenCalledTimes(2);
  });
  test("permission errors and oversized later messages send nothing and consume no cooldown", async () => {
    const repo = new MemoryRepository();
    const executor = new CustomCommandExecutor(repo);
    const send = vi.fn();
    const c = context({
      command: record({ enabled: false, cooldownSeconds: 60 }),
    });
    await expect(executor.execute(c, { send })).rejects.toThrow("disabled");
    expect(send).not.toHaveBeenCalled();
    c.command.enabled = true;
    c.command.content = [
      { type: "TEXT", text: "First" },
      { type: "TEXT", text: "{args}{args}{args}" },
    ];
    c.args = ["x".repeat(1000)];
    await expect(executor.execute(c, { send })).rejects.toThrow("2000");
    expect(send).not.toHaveBeenCalled();
    c.command.content = [{ type: "TEXT", text: "Valid" }];
    await executor.execute(c, { send });
    expect(send).toHaveBeenCalledOnce();
  });
  test("a failed first send releases cooldown; a partially delivered multi-message does not", async () => {
    const repo = new MemoryRepository();
    const executor = new CustomCommandExecutor(repo);
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("send failed"))
      .mockResolvedValue(undefined);
    const c = context({ command: record({ cooldownSeconds: 60 }) });
    await expect(executor.execute(c, { send })).rejects.toThrow("send failed");
    await executor.execute(c, { send });
    const second = {
      ...c,
      command: record({
        id: 2,
        cooldownSeconds: 60,
        content: [
          { type: "TEXT", text: "one" },
          { type: "TEXT", text: "two" },
        ],
      }),
    };
    const partial = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("second failed"));
    await expect(executor.execute(second, { send: partial })).rejects.toThrow(
      "second failed",
    );
    await expect(executor.execute(second, { send: partial })).rejects.toThrow(
      "60 seconds",
    );
    expect(repo.recordUsage).toHaveBeenCalledOnce();
  });
  test("usage counter failure never retries an already delivered response", async () => {
    const repo = new MemoryRepository();
    repo.recordUsage.mockRejectedValue(new Error("DB offline"));
    const send = vi.fn();
    await expect(
      new CustomCommandExecutor(repo).execute(context(), { send }),
    ).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledOnce();
  });
  test("malformed internal arguments and cross-guild commands fail before sends", async () => {
    const send = vi.fn();
    const executor = new CustomCommandExecutor(new MemoryRepository());
    await expect(
      executor.execute(
        context({ args: Array.from({ length: 26 }, () => "x") }),
        { send },
      ),
    ).rejects.toThrow("arguments");
    await expect(
      executor.execute(context({ command: record({ guildId: "other" }) }), {
        send,
      }),
    ).rejects.toThrow("another server");
    expect(send).not.toHaveBeenCalled();
  });
});

test("shared executions count usage on the original definition and keep global cooldowns across servers", async () => {
  const repo = new MemoryRepository();
  const executor = new CustomCommandExecutor(repo);
  const c = context({ command: record({ sourceGuildId: "source-server" }) });
  await executor.execute(c, { send: vi.fn().mockResolvedValue(undefined) });
  expect(repo.recordUsage).toHaveBeenCalledWith("source-server", c.command.id);
  const cooldowns = new CustomCommandCooldownService(() => 1000);
  c.command.cooldownScope = "GLOBAL_COMMAND";
  c.command.cooldownSeconds = 10;
  cooldowns.acquire(c);
  const other = {
    ...c,
    guildId: "guild-b",
    command: { ...c.command, guildId: "guild-b" },
  };
  expect(() => cooldowns.acquire(other)).toThrow("10 seconds");
  const guildCooldowns = new CustomCommandCooldownService(() => 1000);
  c.command.cooldownScope = "GUILD";
  other.command.cooldownScope = "GUILD";
  guildCooldowns.acquire(c);
  expect(() => guildCooldowns.acquire(other)).not.toThrow();
});
