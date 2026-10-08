import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PermissionFlagsBits, type GuildMember, type Message } from "discord.js";

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  list: vi.fn(),
  verified: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("../../src/modules/custom-commands/discord/legacyService.js", () => ({
  customResponseService: { list: mocks.list, listCached: mocks.list },
}));
vi.mock("../../src/modules/guilds/discord/ownership.js", () => ({
  guildOwnershipService: { isVerified: mocks.verified },
}));
vi.mock("../../src/adapters/logging/runtime.js", () => ({
  logger: { error: mocks.error, warn: mocks.warn },
}));

import { runCustomCommand, runCustomEvent } from "../../src/modules/custom-commands/discord/legacyRunner.js";

const baseRule = {
  id: 1,
  guildId: "guild-a",
  name: "hello",
  kind: "command",
  trigger: "hello",
  response: "Hi {user} in {server}: {args} {channel} {memberCount}",
  channelId: null,
  allowedRoleId: null,
  adminOnly: false,
  exactMatch: false,
  embed: false,
  cooldownSeconds: 0,
  enabled: true,
  createdBy: "owner",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function commandFixture(overrides: Record<string, unknown> = {}) {
  const send = vi.fn().mockResolvedValue(undefined);
  const hasPermission = vi.fn().mockReturnValue(true);
  const permissions = vi.fn().mockReturnValue({ has: hasPermission });
  const channel = {
    id: "channel-a",
    isTextBased: () => true,
    permissionsFor: permissions,
    send,
  };
  const guild = {
    id: "guild-a",
    name: "Guild A",
    ownerId: "owner",
    memberCount: 7,
    members: { me: { id: "bot" } },
    channels: { fetch: vi.fn().mockResolvedValue(channel) },
  };
  const member = {
    id: "member-a",
    guild,
    permissions: { has: vi.fn().mockReturnValue(false) },
    roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    user: { username: "alex" },
  };
  const message = {
    content: "!hello world",
    author: { id: "member-a" },
    channel,
    guild,
    member,
    ...overrides,
  };
  return { channel, guild, hasPermission, member, message: message as unknown as Message, permissions, send };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.list.mockResolvedValue([baseRule]);
  mocks.verified.mockResolvedValue(true);
});

afterEach(() => { vi.restoreAllMocks(); });

test("runs a guild command, renders variables, and permits only the invoking user mention", async () => {
  const { message, send } = commandFixture();
  await runCustomCommand(message);
  expect(mocks.list).toHaveBeenCalledWith("guild-a");
  expect(send).toHaveBeenCalledWith({
    content: "Hi <@member-a> in Guild A: world <#channel-a> 7",
    allowedMentions: { parse: [], users: ["member-a"] },
  });
});

test("does not run exact, role-restricted, admin-only, disabled, or unknown commands", async () => {
  const cases = [
    { rule: { ...baseRule, exactMatch: true }, content: "!hello extra" },
    { rule: { ...baseRule, allowedRoleId: "role-a" }, content: "!hello" },
    { rule: { ...baseRule, adminOnly: true }, content: "!hello" },
    { rule: { ...baseRule, enabled: false }, content: "!hello" },
    { rule: baseRule, content: "!unknown" },
  ];
  for (const entry of cases) {
    mocks.list.mockResolvedValueOnce([entry.rule]);
    const { message, send } = commandFixture({ content: entry.content });
    await runCustomCommand(message);
    expect(send).not.toHaveBeenCalled();
  }
});

test("requires send and embed permissions before dispatch", async () => {
  mocks.list.mockResolvedValue([{ ...baseRule, embed: true }]);
  const { message, permissions, send } = commandFixture();
  permissions.mockReturnValue({ has: vi.fn().mockReturnValue(false) });
  await runCustomCommand(message);
  expect(permissions).toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

test("a failed send releases the reserved cooldown so the member can retry", async () => {
  mocks.list.mockResolvedValue([{ ...baseRule, id: 99, cooldownSeconds: 60 }]);
  const { message, send } = commandFixture({ content: "!hello" });
  send.mockRejectedValueOnce(new Error("Missing Access")).mockResolvedValueOnce(undefined);
  await expect(runCustomCommand(message)).rejects.toThrow("Missing Access");
  await expect(runCustomCommand(message)).resolves.toBeUndefined();
  expect(send).toHaveBeenCalledTimes(2);
});

test("cooldowns are independent for each member and server and expire", async () => {
  let now = 100_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  mocks.list.mockResolvedValue([{ ...baseRule, id: 100, cooldownSeconds: 60 }]);
  const first = commandFixture({ content: "!hello" });
  const otherGuild = commandFixture({ content: "!hello" });
  otherGuild.guild.id = "guild-b";
  const otherMember = commandFixture({ content: "!hello", author: { id: "member-b" } });
  otherMember.member.id = "member-b";

  await runCustomCommand(first.message);
  await runCustomCommand(first.message);
  expect(first.send).toHaveBeenCalledOnce();
  await runCustomCommand(otherGuild.message);
  await runCustomCommand(otherMember.message);
  expect(otherGuild.send).toHaveBeenCalledOnce();
  expect(otherMember.send).toHaveBeenCalledOnce();

  now += 60_000;
  await runCustomCommand(first.message);
  expect(first.send).toHaveBeenCalledTimes(2);
});

test("an expired failed send cannot clear a newer successful cooldown", async () => {
  let now = 200_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  mocks.list.mockResolvedValue([{ ...baseRule, id: 101, cooldownSeconds: 60 }]);
  const { message, send } = commandFixture({ content: "!hello" });
  let rejectSend!: (reason: Error) => void;
  let started!: () => void;
  const sendStarted = new Promise<void>((resolve) => { started = resolve; });
  send.mockImplementationOnce(() => {
    started();
    return new Promise<void>((_, reject) => { rejectSend = reject; });
  });
  const firstRun = runCustomCommand(message);
  await sendStarted;
  now += 60_000;
  await runCustomCommand(message);
  rejectSend(new Error("Late failure"));
  await expect(firstRun).rejects.toThrow("Late failure");
  await runCustomCommand(message);
  expect(send).toHaveBeenCalledTimes(2);
});

test.each([
  { embed: false, limit: 2000 },
  { embed: true, limit: 4096 },
])("expanded responses fit Discord's limit ($limit)", async ({ embed, limit }) => {
  mocks.list.mockResolvedValue([{ ...baseRule, response: "{args}".repeat(10), embed }]);
  const { message, send } = commandFixture({ content: `!hello ${"x".repeat(1000)}` });
  await runCustomCommand(message);
  const sent = send.mock.calls[0]![0];
  const content = embed ? sent.embeds[0].data.description : sent.content;
  expect(content).toHaveLength(limit);
  expect(content.endsWith("…")).toBe(true);
});

test("event rules remain guild-scoped, verified, and continue after one send fails", async () => {
  const firstSend = vi.fn().mockRejectedValue(new Error("Missing Access"));
  const secondSend = vi.fn().mockResolvedValue(undefined);
  const channels = new Map([
    ["first", { id: "first", isTextBased: () => true, send: firstSend }],
    ["second", { id: "second", isTextBased: () => true, send: secondSend }],
  ]);
  const guild = {
    id: "guild-a",
    name: "Guild A",
    memberCount: 8,
    members: { me: null },
    channels: { fetch: vi.fn((id: string) => Promise.resolve(channels.get(id))) },
  };
  const member = { id: "member-a", guild, user: { username: "alex" } } as unknown as GuildMember;
  mocks.list.mockResolvedValue([
    { ...baseRule, id: 2, kind: "member_join", channelId: "first" },
    { ...baseRule, id: 3, kind: "member_join", channelId: "second" },
    { ...baseRule, id: 4, kind: "member_leave", channelId: "second" },
  ]);

  await runCustomEvent("member_join", member);
  expect(firstSend).toHaveBeenCalledOnce();
  expect(secondSend).toHaveBeenCalledOnce();
  expect(mocks.warn).toHaveBeenCalledWith(
    expect.objectContaining({ guildId: "guild-a", kind: "member_join", ruleId: 2 }),
    "Failed to send custom event",
  );

  mocks.verified.mockResolvedValue(false);
  await runCustomEvent("member_join", member);
  expect(mocks.list).toHaveBeenCalledOnce();
});

test("embed responses include the rendered content and safe mentions", async () => {
  mocks.list.mockResolvedValue([{ ...baseRule, embed: true }]);
  const { message, send } = commandFixture({ content: "!hello" });
  await runCustomCommand(message);
  const sent = send.mock.calls[0]![0];
  expect(sent.allowedMentions).toEqual({ parse: [], users: ["member-a"] });
  expect(sent.embeds[0].data.description).toContain("Hi <@member-a>");
});

test("permission requirements include view, send, and embed access", async () => {
  mocks.list.mockResolvedValue([{ ...baseRule, embed: true }]);
  const { hasPermission, message } = commandFixture({ content: "!hello" });
  await runCustomCommand(message);
  const required = hasPermission.mock.calls[0]![0] as bigint[];
  expect(required).toEqual([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ]);
});

test("commands in threads use the thread-specific send permission", async () => {
  const { channel, hasPermission, message, send } = commandFixture({ content: "!hello" });
  Object.assign(channel, { isThread: () => true });
  hasPermission.mockImplementation((required: bigint[]) =>
    !required.includes(PermissionFlagsBits.SendMessages) && required.includes(PermissionFlagsBits.SendMessagesInThreads),
  );
  await runCustomCommand(message);
  expect(send).toHaveBeenCalledOnce();
});
