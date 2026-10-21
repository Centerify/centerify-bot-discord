import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import {
  Collection,
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
  type GuildMember,
} from "discord.js";
import { expect, test, vi } from "vitest";
vi.mock("../../../src/modules/guilds/discord/ownership.js", () => ({
  guildOwnershipService: { isVerified: async () => true },
}));
import { silentLogger } from "../../../src/core/index.js";
import { CustomCommandArgumentError } from "../../../src/modules/custom-commands/domain/errors.js";
import { renderComponentAction } from "../../../src/modules/custom-commands/discord/actionTemplates.js";
vi.mock("../../../src/adapters/logging/runtime.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));
import {
  ComponentActionExecutor,
  ComponentActionExecutionError,
  type ComponentActionServices,
} from "../../../src/modules/custom-commands/discord/ComponentActionExecutor.js";
import {
  WarnMember,
  type WarningRepository,
  type WarningCase,
} from "../../../src/modules/moderation/application/WarnMember.js";
import { CustomCommandValidator } from "../../../src/modules/custom-commands/domain/CustomCommandValidator.js";
import { CustomCommandRenderer } from "../../../src/modules/custom-commands/discord/CustomCommandRenderer.js";
import { CustomCommandExecutor } from "../../../src/modules/custom-commands/discord/CustomCommandExecutor.js";
import { CustomCommandService } from "../../../src/modules/custom-commands/application/CustomCommandService.js";
import {
  parseCommandMarkdown,
  serializeCommandMarkdown,
  markdownPatch,
} from "../../../src/modules/custom-commands/discord/markdown.js";
import { attachStageNavigation } from "../../../src/modules/custom-commands/discord/stageNavigation.js";
import { validateGuildReferences } from "../../../src/modules/custom-commands/discord/CustomCommandGuildValidator.js";
import { hasServerActionReferences } from "../../../src/modules/custom-commands/domain/components.js";
import type {
  EffectAction,
  SequenceAction,
} from "../../../src/modules/custom-commands/domain/types.js";
import { context, record, definition, MemoryRepository, USER, ROLE } from "./fixtures.js";

const TARGET = "423456789012345678";
const OTHER_CHANNEL = "523456789012345678";
const TARGET_VARIABLE = "{args.0}";
const validator = new CustomCommandValidator();
const highest = (position: number) => ({
  position,
  comparePositionTo: (other: { position: number }) => position - other.position,
});
function setup(
  action: EffectAction | SequenceAction = {
    action: "note",
    userId: TARGET_VARIABLE,
    reason: "Reviewed by {user.name}",
  },
) {
  const ctx = context({
    command: record({
      content: [
        {
          type: "TEXT",
          text: "Actions",
          buttons: [{ label: "Apply", ...action }],
        },
      ],
    }),
    args: [`<@${TARGET}>`],
  });
  const permissions = () =>
    new PermissionsBitField([
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.ManageNicknames,
      PermissionFlagsBits.ChangeNickname,
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ]);
  Object.assign(ctx.member, {
    permissions: permissions(),
    roles: {
      cache: new Map(),
      highest: highest(10),
      add: vi.fn(),
      remove: vi.fn(),
    },
    manageable: true,
  });
  const target = {
    id: TARGET,
    guild: ctx.guild,
    user: { bot: false, system: false },
    permissions: permissions(),
    roles: {
      highest: highest(1),
      cache: new Map(),
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    manageable: true,
    moderatable: true,
    kickable: true,
    bannable: true,
    timeout: vi.fn().mockResolvedValue(undefined),
    kick: vi.fn().mockResolvedValue(undefined),
    setNickname: vi.fn().mockResolvedValue(undefined),
  };
  const me = {
    id: "bot",
    permissions: permissions(),
    roles: { highest: highest(100) },
  };
  const fetchMember = vi.fn(async ({ user }: { user: string }) =>
    user === USER ? ctx.member : (target as unknown as GuildMember),
  );
  const ban = vi.fn().mockResolvedValue(undefined),
    unban = vi.fn().mockResolvedValue(undefined);
  Object.assign(ctx.guild.members, {
    me,
    fetch: fetchMember,
    fetchMe: vi.fn().mockResolvedValue(me),
    ban,
    unban,
  });
  Object.assign(ctx.guild, {
    ownerId: "owner",
    bans: { fetch: vi.fn().mockResolvedValue({}) },
    client: { users: { fetch: vi.fn().mockResolvedValue({ id: TARGET }) } },
  });
  const warningRole = {
    permissions: new PermissionsBitField(),
    id: ROLE,
    name: "Warn 1",
    guild: ctx.guild,
    managed: false,
    editable: true,
    comparePositionTo: (other: { position: number }) => 2 - other.position,
  };
  const fetchRoles = vi.fn().mockResolvedValue(warningRole),
    createRole = vi.fn().mockResolvedValue(warningRole);
  Object.assign(ctx.guild, {
    roles: { fetch: fetchRoles, cache: new Collection(), create: createRole },
  });
  const send = vi.fn().mockResolvedValue(undefined);
  const channel = {
    id: OTHER_CHANNEL,
    guildId: ctx.guildId,
    type: ChannelType.GuildText,
    isTextBased: () => true,
    isThread: () => false,
    send,
    permissionsFor: (member: GuildMember) =>
      member.id === USER ? ctx.member.permissions : me.permissions,
    setName: vi.fn().mockResolvedValue(undefined),
    setTopic: vi.fn().mockResolvedValue(undefined),
    setRateLimitPerUser: vi.fn().mockResolvedValue(undefined),
    setParent: vi.fn().mockResolvedValue(undefined),
  };
  Object.assign(ctx.channel, { isTextBased: () => true, send });
  const fetchChannel = vi.fn().mockResolvedValue(channel);
  Object.assign(ctx.guild, {
    channels: {
      fetch: fetchChannel,
      cache: new Map([[OTHER_CHANNEL, channel]]),
    },
  });
  const warning: WarningCase = {
    id: 1,
    guildId: ctx.guildId,
    caseNumber: 7,
    targetUserId: TARGET,
    moderatorUserId: USER,
    action: "WARNING",
    reason: "Reason",
    durationMs: 60_000,
    isGlobal: false,
    metadata: { warningRoleId: ROLE },
    createdAt: "2026-10-09T00:00:00Z",
    updatedAt: "2026-10-09T00:00:00Z",
  };
  const createCase = vi.fn().mockResolvedValue(warning);
  const warningRepository: WarningRepository = {
    createCase,
    countWarningsForUser: vi.fn().mockResolvedValue(0),
  };
  const revoke = vi.fn().mockResolvedValue(warning);
  const scheduleWarning = vi.fn().mockReturnValue(true),
    cancelWarning = vi.fn().mockReturnValue(true),
    removeWarningRole = vi.fn().mockResolvedValue("removed");
  const services: ComponentActionServices = {
    cases: { createCase, revokeActiveWarning: revoke },
    warnings: new WarnMember(warningRepository),
    scheduleWarning,
    cancelWarning,
    removeWarningRole,
  };
  const executor = new ComponentActionExecutor(services);
  const loadCommand = vi.fn().mockResolvedValue(ctx.command);
  const active = vi.fn().mockReturnValue(true),
    attempt = vi.fn();
  const execute = () => executor.execute(ctx, action, loadCommand, active, attempt);
  const collector = Object.assign(new EventEmitter(), { stop: vi.fn() });
  const message = {
    createMessageComponentCollector: vi.fn().mockReturnValue(collector),
    edit: vi.fn().mockResolvedValue(undefined),
  };
  const click = (values?: string[]) => ({
    customId: values ? "cc-select:0:0" : "cc-response:0:0",
    user: { id: USER },
    values: values ?? [],
    isStringSelectMenu: () => values !== undefined,
    isButton: () => values === undefined,
    reply: vi.fn().mockResolvedValue(undefined),
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  });
  const collect = (interaction: ReturnType<typeof click>) =>
    (collector.listeners("collect")[0] as (interaction: ReturnType<typeof click>) => Promise<void>)(
      interaction,
    );
  const attach = async (preview = false) =>
    attachStageNavigation(message, ctx, await new CustomCommandRenderer().render(ctx, true), {
      preview,
      loadCommand,
      actionExecutor: executor,
    });
  return {
    ctx,
    target,
    me,
    warningRole,
    createRole,
    fetchMember,
    fetchRoles,
    fetchChannel,
    channel,
    ban,
    unban,
    send,
    warning,
    createCase,
    revoke,
    scheduleWarning,
    cancelWarning,
    removeWarningRole,
    executor,
    services,
    loadCommand,
    active,
    attempt,
    execute,
    collector,
    message,
    click,
    collect,
    attach,
  };
}

test("warnings use the real warning policy, assign warning roles, record actor and schedule expiry", async () => {
  const s = setup({
    action: "warn",
    userId: TARGET_VARIABLE,
    reason: "Reviewed by {user.name}",
    durationMs: 60_000,
  });
  expect(await s.execute()).toContain("Warning added — Case #7");
  expect(s.createCase).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      guildId: s.ctx.guildId,
      targetUserId: TARGET,
      moderatorUserId: USER,
      action: "WARNING",
      reason: "Reviewed by Alex",
      durationMs: 60_000,
      isGlobal: false,
      metadata: { warningRoleId: ROLE, warningCount: 1 },
    }),
  );
  expect(s.target.roles.add).toHaveBeenCalledWith(ROLE, expect.stringContaining("actor"));
  expect(s.scheduleWarning).toHaveBeenCalledWith(s.ctx.guild.client, s.warning);
});

test("unwarn preserves the warning lifecycle; notes stay private and audited", async () => {
  const s = setup({
    action: "unwarn",
    userId: TARGET_VARIABLE,
    reason: "Reviewed",
    caseNumber: 7,
  });
  expect(await s.execute()).toContain("Warning #7 removed");
  expect(s.revoke).toHaveBeenCalledWith({
    guildId: s.ctx.guildId,
    targetUserId: TARGET,
    moderatorUserId: USER,
    reason: "Reviewed",
    caseNumber: 7,
  });
  expect(s.cancelWarning).toHaveBeenCalledWith(s.warning);
  expect(s.removeWarningRole).toHaveBeenCalledWith(
    s.ctx.guild.client,
    s.warning,
    expect.any(String),
  );
  const note = setup();
  expect(await note.execute()).toContain("Note added");
  expect(note.createCase).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "NOTE",
      reason: "Reviewed by Alex",
      targetUserId: TARGET,
      moderatorUserId: USER,
    }),
  );
  expect(note.send).not.toHaveBeenCalled();
});

test.each(["timeout", "removetimeout", "kick", "ban", "unban", "setnickname"] as const)(
  "%s applies the configured effect and records moderation cases when appropriate",
  async (name) => {
    const action: EffectAction =
      name === "timeout"
        ? {
            action: name,
            userId: TARGET_VARIABLE,
            durationMs: 60_000,
            reason: "Reason",
          }
        : name === "setnickname"
          ? { action: name, userId: TARGET_VARIABLE, nickname: "New name" }
          : { action: name, userId: TARGET_VARIABLE, reason: "Reason" };
    const s = setup(action);
    await s.execute();
    if (name === "timeout" || name === "removetimeout")
      expect(s.target.timeout).toHaveBeenCalledWith(
        name === "timeout" ? 60_000 : null,
        expect.any(String),
      );
    if (name === "kick") expect(s.target.kick).toHaveBeenCalledOnce();
    if (name === "ban")
      expect(s.ban).toHaveBeenCalledWith(
        TARGET,
        expect.objectContaining({ deleteMessageSeconds: 0 }),
      );
    if (name === "unban") expect(s.unban).toHaveBeenCalledWith(TARGET, expect.any(String));
    if (name === "setnickname") {
      expect(s.target.setNickname).toHaveBeenCalledWith("New name", expect.any(String));
      expect(s.createCase).not.toHaveBeenCalled();
    } else
      expect(s.createCase).toHaveBeenCalledWith(
        expect.objectContaining({
          targetUserId: TARGET,
          moderatorUserId: USER,
          action: name === "removetimeout" ? "TIMEOUT" : name.toUpperCase(),
        }),
      );
  },
);

test("reply, public message, nickname clearing and custom success text render variables once", async () => {
  const s = setup({
    action: "sendmessage",
    channelId: OTHER_CHANNEL,
    text: "Hello {user.mention} @everyone",
    successMessage: "Sent for {user.name}",
  });
  expect(await s.execute()).toBe("Sent for Alex");
  expect(s.send).toHaveBeenCalledExactlyOnceWith({
    content: `Hello <@${USER}> @\u200beveryone`,
    allowedMentions: {
      parse: [],
      users: [USER],
      roles: [],
      repliedUser: false,
    },
  });
  expect(s.fetchChannel).toHaveBeenCalledWith(OTHER_CHANNEL, { force: true });
  const reply = setup({ action: "reply", text: "{args.1}" });
  reply.ctx.args[1] = "Literal {user.name}";
  expect(await reply.execute()).toBe("Literal {user.name}");
  const nick = setup({
    action: "setnickname",
    userId: TARGET_VARIABLE,
    nickname: "",
  });
  await nick.execute();
  expect(nick.target.setNickname).toHaveBeenCalledWith(null, expect.any(String));
});

test("self nickname changes use Change Nickname without requiring a role above oneself", async () => {
  const s = setup({
    action: "setnickname",
    userId: "{user.id}",
    nickname: "Chosen name",
  });
  const change = vi.fn().mockResolvedValue(undefined);
  Object.assign(s.ctx.member, { setNickname: change });
  s.ctx.member.permissions.remove(PermissionFlagsBits.ManageNicknames);
  await expect(s.execute()).resolves.toBe("Nickname updated.");
  expect(change).toHaveBeenCalledWith("Chosen name", expect.any(String));
});

test.each([
  "actor permission",
  "bot permission",
  "owner",
  "self",
  "actor hierarchy",
  "bot hierarchy",
  "unmanageable target",
  "expired",
  "disabled command",
  "changed command",
  "target left",
])("moderation denies %s before any effects", async (reason) => {
  const s = setup({
    action: "timeout",
    userId: TARGET_VARIABLE,
    reason: "Reason",
    durationMs: 60_000,
  });
  switch (reason) {
    case "actor permission":
      s.ctx.member.permissions.remove(PermissionFlagsBits.ModerateMembers);
      break;
    case "bot permission":
      s.me.permissions.remove(PermissionFlagsBits.ModerateMembers);
      break;
    case "owner":
      Object.assign(s.ctx.guild, { ownerId: TARGET });
      break;
    case "self":
      s.ctx.args[0] = USER;
      break;
    case "actor hierarchy":
      s.target.roles.highest = highest(10);
      break;
    case "bot hierarchy":
      s.target.roles.highest = highest(100);
      Object.assign(s.ctx.guild, { ownerId: USER });
      break;
    case "unmanageable target":
      s.target.moderatable = false;
      break;
    case "expired":
      s.active.mockReturnValue(false);
      break;
    case "disabled command":
      s.loadCommand.mockResolvedValue({ ...s.ctx.command, enabled: false });
      break;
    case "changed command":
      s.loadCommand.mockResolvedValue({
        ...s.ctx.command,
        updatedAt: "changed",
      });
      break;
    case "target left":
      s.fetchMember.mockImplementation(async ({ user }) => {
        if (user !== USER) throw new Error("Unknown member");
        return s.ctx.member;
      });
      break;
  }
  await expect(s.execute()).rejects.toThrow();
  expect(s.attempt).not.toHaveBeenCalled();
  expect(s.createCase).not.toHaveBeenCalled();
  expect(s.target.timeout).not.toHaveBeenCalled();
});

test("a sequence validates every step before writing, then stops with a partial completion count", async () => {
  const action: SequenceAction = {
    action: "sequence",
    actions: [
      { action: "note", userId: TARGET_VARIABLE, reason: "Note" },
      { action: "kick", userId: TARGET_VARIABLE, reason: "Kick" },
    ],
  };
  const s = setup(action);
  s.ctx.member.permissions.remove(PermissionFlagsBits.KickMembers);
  await expect(s.execute()).rejects.toThrow("permission");
  expect(s.createCase).not.toHaveBeenCalled();
  s.ctx.member.permissions.add(PermissionFlagsBits.KickMembers);
  s.target.kick.mockRejectedValue(new Error("REST failure"));
  await expect(s.execute()).rejects.toMatchObject({
    completed: 1,
    total: 2,
    attempted: true,
  });
  expect(s.createCase).toHaveBeenCalledOnce();
  expect(s.target.kick).toHaveBeenCalledOnce();
});

test("workflow acknowledgements fit Discord's limit without breaking Unicode", async () => {
  const s = setup({
    action: "sequence",
    actions: [
      { action: "reply", text: "First" },
      { action: "reply", text: "😀".repeat(1000) },
    ],
  });
  const reply = await s.execute();
  expect(reply.length).toBeLessThanOrEqual(2000);
  expect(reply).toMatch(/^2 actions completed\./);
  expect(reply.endsWith("…")).toBe(true);
  expect(Buffer.from(reply, "utf8").toString("utf8")).toBe(reply);
});

test("sequence authorization refreshes between steps and does not repeat completed actions after expiry", async () => {
  const s = setup({
    action: "sequence",
    actions: [
      { action: "note", userId: TARGET_VARIABLE, reason: "Note" },
      {
        action: "timeout",
        userId: TARGET_VARIABLE,
        durationMs: 60_000,
        reason: "Reason",
      },
    ],
  });
  s.createCase.mockImplementation(async () => {
    s.active.mockReturnValue(false);
    return s.warning;
  });
  await expect(s.execute()).rejects.toMatchObject({ completed: 1, total: 2 });
  expect(s.target.timeout).not.toHaveBeenCalled();
  expect(s.createCase).toHaveBeenCalledOnce();
});

test("a sequence stops when the actor loses permission after a completed step", async () => {
  const s = setup({
    action: "sequence",
    actions: [
      { action: "note", userId: TARGET_VARIABLE, reason: "Note" },
      { action: "kick", userId: TARGET_VARIABLE, reason: "Reason" },
    ],
  });
  s.createCase.mockImplementation(async () => {
    s.ctx.member.permissions.remove(PermissionFlagsBits.KickMembers);
    return s.warning;
  });
  await expect(s.execute()).rejects.toMatchObject({ completed: 1, total: 2 });
  expect(s.target.kick).not.toHaveBeenCalled();
});

test("equivalent stored JSON key ordering does not invalidate an unchanged action", async () => {
  const s = setup();
  const button = s.ctx.command.content[0].buttons![0];
  s.loadCommand.mockResolvedValue({
    ...s.ctx.command,
    content: [
      {
        buttons: [
          {
            reason: "Reviewed by {user.name}",
            userId: TARGET_VARIABLE,
            action: "note",
            label: button.label,
          },
        ],
        text: "Actions",
        type: "TEXT",
      },
    ],
  });
  await expect(s.execute()).resolves.toContain("Note added");
});

test("warning role assignment failure retains its audit case, rejects invalid warning roles and does not create extra cases", async () => {
  const s = setup({
    action: "warn",
    userId: TARGET_VARIABLE,
    reason: "Reason",
  });
  s.target.roles.add.mockRejectedValue(new Error("REST failure"));
  await expect(s.execute()).rejects.toBeInstanceOf(ComponentActionExecutionError);
  expect(s.createCase).toHaveBeenCalledOnce();
  const denied = setup({
    action: "warn",
    userId: TARGET_VARIABLE,
    reason: "Reason",
  });
  denied.warningRole.editable = false;
  await expect(denied.execute()).rejects.toThrow("warning role");
  expect(denied.createCase).not.toHaveBeenCalled();
});

test("message actions reject foreign channels and missing actor access", async () => {
  const s = setup({
    action: "sendmessage",
    channelId: OTHER_CHANNEL,
    text: "Hi",
  });
  s.channel.guildId = "other";
  await expect(s.execute()).rejects.toThrow("server");
  expect(s.send).not.toHaveBeenCalled();
  s.channel.guildId = s.ctx.guildId;
  s.channel.permissionsFor = () => new PermissionsBitField();
  await expect(s.execute()).rejects.toThrow("permission");
  expect(s.send).not.toHaveBeenCalled();
});

test.each([
  [
    { action: "setchannelname", channelId: OTHER_CHANNEL, name: "staff-chat" },
    "setName",
    "staff-chat",
  ],
  [
    {
      action: "setchanneltopic",
      channelId: OTHER_CHANNEL,
      topic: "Welcome {user.name}",
    },
    "setTopic",
    "Welcome Alex",
  ],
  [{ action: "setchanneltopic", channelId: OTHER_CHANNEL, topic: "" }, "setTopic", null],
  [
    { action: "setslowmode", channelId: OTHER_CHANNEL, seconds: 21600 },
    "setRateLimitPerUser",
    21600,
  ],
  [{ action: "setslowmode", channelId: OTHER_CHANNEL, seconds: 0 }, "setRateLimitPerUser", 0],
] as const)(
  "channel action %j executes through the authorized workflow",
  async (action, method, value) => {
    const s = setup(action);
    await expect(s.execute()).resolves.toContain("Channel");
    expect(s.channel[method]).toHaveBeenCalledExactlyOnceWith(value, expect.stringContaining(USER));
    expect(s.fetchChannel).toHaveBeenCalledWith(OTHER_CHANNEL, { force: true });
    expect(s.createCase).not.toHaveBeenCalled();
  },
);

test.each([
  "actor permission",
  "bot permission",
  "actor view",
  "bot view",
  "foreign channel",
  "unsupported channel",
  "deleted channel",
  "expired",
])("channel actions reject %s before changing Discord", async (condition) => {
  const s = setup({
    action: "setchannelname",
    channelId: OTHER_CHANNEL,
    name: "new-name",
  });
  if (condition === "actor permission")
    s.ctx.member.permissions.remove(PermissionFlagsBits.ManageChannels);
  if (condition === "bot permission") s.me.permissions.remove(PermissionFlagsBits.ManageChannels);
  if (condition === "actor view") s.ctx.member.permissions.remove(PermissionFlagsBits.ViewChannel);
  if (condition === "bot view") s.me.permissions.remove(PermissionFlagsBits.ViewChannel);
  if (condition === "foreign channel") s.channel.guildId = "other";
  if (condition === "unsupported channel") s.channel.type = ChannelType.GuildVoice;
  if (condition === "deleted channel") s.fetchChannel.mockResolvedValue(null as never);
  if (condition === "expired") s.active.mockReturnValue(false);
  await expect(s.execute()).rejects.toThrow();
  expect(s.channel.setName).not.toHaveBeenCalled();
  expect(s.attempt).not.toHaveBeenCalled();
});

test("channel category actions check the destination and preserve permission overwrites", async () => {
  const categoryId = "623456789012345678";
  const s = setup({
    action: "setchannelcategory",
    channelId: OTHER_CHANNEL,
    categoryId,
  });
  const category = {
    ...s.channel,
    id: categoryId,
    type: ChannelType.GuildCategory,
  };
  s.fetchChannel.mockImplementation(async (id) => (id === categoryId ? category : s.channel));
  await expect(s.execute()).resolves.toBe("Channel category updated.");
  expect(s.channel.setParent).toHaveBeenCalledExactlyOnceWith(categoryId, {
    lockPermissions: false,
    reason: expect.stringContaining(USER),
  });
  s.channel.setParent.mockClear();
  category.permissionsFor = () => new PermissionsBitField();
  await expect(s.execute()).rejects.toThrow("destination category");
  expect(s.channel.setParent).not.toHaveBeenCalled();
  category.type = ChannelType.GuildText;
  await expect(s.execute()).rejects.toThrow("category in this server");
  category.type = ChannelType.GuildCategory;
  category.guildId = "other";
  await expect(s.execute()).rejects.toThrow("category in this server");
  const clear = setup({
    action: "setchannelcategory",
    channelId: OTHER_CHANNEL,
    categoryId: null,
  });
  await clear.execute();
  expect(clear.channel.setParent).toHaveBeenCalledWith(
    null,
    expect.objectContaining({ lockPermissions: false }),
  );
});

test("slowmode rejects announcement channels before attempting an update", async () => {
  const s = setup({
    action: "setslowmode",
    channelId: OTHER_CHANNEL,
    seconds: 5,
  });
  s.channel.type = ChannelType.GuildAnnouncement;
  await expect(s.execute()).rejects.toThrow("regular text channel");
  expect(s.channel.setRateLimitPerUser).not.toHaveBeenCalled();
});

test("a later unauthorized channel step prevents all writes; permissions refresh between steps", async () => {
  const s = setup({
    action: "sequence",
    actions: [
      { action: "reply", text: "Starting" },
      { action: "setchannelname", channelId: OTHER_CHANNEL, name: "new-name" },
      {
        action: "setchanneltopic",
        channelId: OTHER_CHANNEL,
        topic: "New topic",
      },
    ],
  });
  s.ctx.member.permissions.remove(PermissionFlagsBits.ManageChannels);
  await expect(s.execute()).rejects.toThrow("Manage Channels");
  expect(s.attempt).not.toHaveBeenCalled();
  s.ctx.member.permissions.add(PermissionFlagsBits.ManageChannels);
  s.channel.setName.mockImplementation(async () => {
    s.ctx.member.permissions.remove(PermissionFlagsBits.ManageChannels);
  });
  await expect(s.execute()).rejects.toMatchObject({ completed: 2, total: 3 });
  expect(s.channel.setName).toHaveBeenCalledOnce();
  expect(s.channel.setTopic).not.toHaveBeenCalled();
});

test("channel controls preview without changing server settings", async () => {
  const s = setup({
    action: "setchannelname",
    channelId: OTHER_CHANNEL,
    name: "new-name",
  });
  await s.attach(true);
  await s.collect(s.click());
  expect(s.channel.setName).not.toHaveBeenCalled();
  expect(s.loadCommand).not.toHaveBeenCalled();
});

test("the channel management example renders and survives template export", async () => {
  const content = parseCommandMarkdown(
    readFileSync("docs/channel-management-template.cfg", "utf8"),
  );
  expect(parseCommandMarkdown(serializeCommandMarkdown(content))).toEqual(content);
  const s = setup();
  s.ctx.command = record({ content, responseType: "EMBED" });
  await expect(new CustomCommandRenderer().render(s.ctx)).resolves.toHaveLength(1);
  expect(s.channel.setName).not.toHaveBeenCalled();
  expect(s.channel.setTopic).not.toHaveBeenCalled();
  expect(s.channel.setParent).not.toHaveBeenCalled();
});

test("category references in custom aliases are checked on save and prevent sharing", async () => {
  const categoryId = "623456789012345678";
  const content = markdownPatch(
    `@var CATEGORY = ${categoryId}\nHello\n@button [Move](SetChannelCategory("{channel.id}", "{CATEGORY}"))`,
  ).content;
  expect(hasServerActionReferences(content)).toBe(true);
  const s = setup();
  s.ctx.guild.channels.cache.set(categoryId, {
    id: categoryId,
    guildId: s.ctx.guildId,
    type: ChannelType.GuildCategory,
  } as never);
  await expect(
    validateGuildReferences(s.ctx.guild, [definition({ content })]),
  ).resolves.toBeUndefined();
  s.ctx.guild.channels.cache.delete(categoryId);
  await expect(validateGuildReferences(s.ctx.guild, [definition({ content })])).rejects.toThrow(
    "Category",
  );
  expect(
    hasServerActionReferences(
      markdownPatch('Hello\n@button [Move](SetChannelCategory("{channel.id}", "{args.0}"))')
        .content,
    ),
  ).toBe(false);
});

test("notes default to once per button, explicit repeatability works, and previews never record effects", async () => {
  const s = setup();
  await s.attach();
  const first = s.click();
  await s.collect(first);
  expect(first.deferReply).toHaveBeenCalledWith({ flags: 64 });
  const duplicate = s.click();
  await s.collect(duplicate);
  expect(duplicate.reply).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining("already been used"),
    }),
  );
  expect(s.createCase).toHaveBeenCalledOnce();
  const repeat = setup({
    action: "note",
    userId: TARGET_VARIABLE,
    reason: "Note",
    repeatable: true,
  });
  await repeat.attach();
  await repeat.collect(repeat.click());
  await repeat.collect(repeat.click());
  expect(repeat.createCase).toHaveBeenCalledTimes(2);
  const preview = setup();
  await preview.attach(true);
  const click = preview.click();
  await preview.collect(click);
  expect(click.reply).toHaveBeenCalledWith({
    content: "Preview only — no actions are executed.",
    flags: 64,
  });
  expect(preview.createCase).not.toHaveBeenCalled();
  expect(preview.loadCommand).not.toHaveBeenCalled();
});

test("a note can follow a kick and reference a former member", async () => {
  const s = setup({
    action: "sequence",
    actions: [
      { action: "kick", userId: TARGET_VARIABLE, reason: "Reason" },
      { action: "note", userId: TARGET_VARIABLE, reason: "Follow-up note" },
    ],
  });
  s.target.kick.mockImplementation(async () => {
    s.fetchMember.mockImplementation(async ({ user }) => {
      if (user !== USER) throw new Error("Member left");
      return s.ctx.member;
    });
  });
  await expect(s.execute()).resolves.toContain("2 actions completed");
  expect(s.createCase.mock.calls.map(([input]) => input.action)).toEqual(["KICK", "NOTE"]);
});

test("notes validate the target's Discord identity before recording a case", async () => {
  const s = setup();
  vi.spyOn(s.ctx.guild.client.users, "fetch").mockRejectedValue(new Error("Unknown user"));
  await expect(s.execute()).rejects.toThrow("Unknown user");
  expect(s.createCase).not.toHaveBeenCalled();
  expect(s.attempt).not.toHaveBeenCalled();
});

test("the guide's review, structured action and sequence examples remain valid", () => {
  const section = readFileSync("docs/custom-commands.md", "utf8")
    .replaceAll("\r\n", "\n")
    .split("### Custom actions and workflows")[1];
  const examples = [...section.matchAll(/```text\n([\s\S]*?)\n```/g)].slice(0, 3);
  expect(examples).toHaveLength(3);
  for (const example of examples) expect(parseCommandMarkdown(example[1])).toHaveLength(1);
});

test("the member-review template gives usage guidance for missing targets and accepts a corrected invocation immediately", async () => {
  const s = setup();
  s.ctx.command = record({
    name: "kos",
    cooldownSeconds: 60,
    ...markdownPatch(readFileSync("docs/member-review-template.cfg", "utf8")),
  });
  Object.assign(s.ctx.member.user, {
    displayAvatarURL: () => "https://example.com/avatar.png",
  });
  const repository = new MemoryRepository();
  const warn = vi.fn();
  const executor = new CustomCommandExecutor(
    repository,
    undefined,
    undefined,
    undefined,
    { ...silentLogger, warn },
    s.executor,
  );
  const send = vi.fn().mockResolvedValue(s.message);
  s.ctx.args = [];
  await expect(executor.execute(s.ctx, { send })).rejects.toThrow("Usage: !kos @Member");
  expect(send).not.toHaveBeenCalled();
  expect(repository.recordUsage).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledWith(
    expect.objectContaining({
      errorType: "CustomCommandArgumentError",
      validationMessage: expect.stringContaining("Missing member argument {args.0}"),
      sent: 0,
    }),
    "custom_command.failed",
  );
  s.ctx.args = [`<@${TARGET}>`];
  await executor.execute(s.ctx, { send });
  expect(send).toHaveBeenCalledOnce();
  expect(repository.recordUsage).toHaveBeenCalledOnce();
  expect(s.createCase).not.toHaveBeenCalled();
});

test.each([
  ["userId", "{args.0}", "@Member"],
  ["userId", "{args.first}", "@Member"],
  ["channelId", "{args.0}", "#channel"],
] as const)(
  "invalid %s argument %s gives guidance without echoing argument values",
  async (field, variable, example) => {
    const action =
      field === "userId"
        ? { action: "note" as const, userId: variable, reason: "Private note" }
        : {
            action: "sendmessage" as const,
            channelId: variable,
            text: "Update",
          };
    const c = context({ args: ["private-invalid-value"] });
    try {
      await renderComponentAction(action, c);
      expect.fail("Expected invalid target rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(CustomCommandArgumentError);
      expect((error as Error).message).toContain(`Usage: !welcome ${example}`);
      expect((error as Error).message).not.toContain("private-invalid-value");
      expect((error as Error).message).not.toContain("Private note");
    }
  },
);

test("failed acknowledgement and unauthorized clicks preserve the control; partial attempts consume it", async () => {
  const s = setup();
  await s.attach();
  const rejected = s.click();
  rejected.deferReply.mockRejectedValue(new Error("network"));
  await s.collect(rejected);
  expect(s.createCase).not.toHaveBeenCalled();
  s.ctx.member.permissions.remove(PermissionFlagsBits.ModerateMembers);
  await s.collect(s.click());
  expect(s.createCase).not.toHaveBeenCalled();
  s.ctx.member.permissions.add(PermissionFlagsBits.ModerateMembers);
  s.createCase.mockRejectedValueOnce(new Error("database"));
  await s.collect(s.click());
  const retry = s.click();
  await s.collect(retry);
  expect(s.createCase).toHaveBeenCalledOnce();
  expect(retry.reply).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining("already been used"),
    }),
  );
});

test("dropdown options execute distinct workflows and consume each option independently", async () => {
  const s = setup();
  s.ctx.command.content = [
    {
      type: "TEXT",
      text: "Actions",
      selects: [
        {
          placeholder: "Choose",
          options: [
            {
              label: "Note",
              action: "note",
              userId: TARGET_VARIABLE,
              reason: "Note",
            },
            {
              label: "Timeout",
              action: "timeout",
              userId: TARGET_VARIABLE,
              durationMs: 60_000,
              reason: "Reason",
            },
          ],
        },
      ],
    },
  ];
  await s.attach();
  await s.collect(s.click(["0"]));
  await s.collect(s.click(["1"]));
  await s.collect(s.click(["0"]));
  expect(s.createCase).toHaveBeenCalledTimes(2);
  expect(s.target.timeout).toHaveBeenCalledOnce();
});

test("production command delivery attaches action handlers and counts usage only for invocation", async () => {
  const s = setup();
  const repository = new MemoryRepository();
  repository.records = [s.ctx.command];
  const send = vi.fn().mockResolvedValue(s.message);
  await new CustomCommandExecutor(
    repository,
    undefined,
    undefined,
    undefined,
    undefined,
    s.executor,
  ).execute(s.ctx, { send });
  expect(send).toHaveBeenCalledOnce();
  await s.collect(s.click());
  expect(s.createCase).toHaveBeenCalledOnce();
  expect(repository.recordUsage).toHaveBeenCalledOnce();
});

test.each([
  `Warn("{args.0}", "Reason", "1h")`,
  `SetWarn("{args.0}", "Reason")`,
  `AddNote("{args.0}", "Note")`,
  `Unwarn("{args.0}", "Reason", 7)`,
  `RemoveWarn("{args.0}", "Reason")`,
  `Timeout("{args.0}", "10m", "Reason")`,
  `RemoveTimeout("{args.0}", "Reason")`,
  `Kick("{args.0}", "Reason")`,
  `Ban("{args.0}", "Reason", 60)`,
  `Unban("{args.0}", "Reason")`,
  `SetNickname("{args.0}", "Nickname")`,
  `Reply("Hello {user.name}")`,
  `SendMessage("{channel.id}", "Hi")`,
  `SetChannelName("{channel.id}", "chat")`,
  `RenameChannel("{channel.id}", "chat")`,
  `SetChannelTopic("{channel.id}", "Welcome {user.name}")`,
  `SetSlowmode("{channel.id}", 10)`,
  `SetChannelCategory("{channel.id}", "${OTHER_CHANNEL}")`,
  `SetChannelCategory("{channel.id}", null)`,
  `SetRole("${ROLE}", "{args.0}")`,
  `Action({"action":"note","userId":"{args.0}","reason":"Note","repeatable":true,"successMessage":"Saved!"})`,
  `Actions([{"action":"note","userId":"{args.0}","reason":"Note"},{"action":"reply","text":"Done"}])`,
])("%s survives template download, JSON export/import and expanded rendering", async (call) => {
  const patch = markdownPatch(`Hi\n@button [Apply](${call})`);
  expect(parseCommandMarkdown(serializeCommandMarkdown(patch.content))).toEqual(patch.content);
  const service = new CustomCommandService(new MemoryRepository());
  await service.createCommand("guild-a", USER, definition(patch));
  await service.importCommands("guild-b", USER, await service.exportCommands("guild-a"));
  expect((await service.getCommand("guild-b", "welcome"))!.content).toEqual(patch.content);
  const s = setup();
  s.ctx.command = record(patch);
  await expect(new CustomCommandRenderer().render(s.ctx, true)).resolves.toHaveLength(1);
});

test.each([
  { action: "setchannelname", channelId: OTHER_CHANNEL, name: "" },
  { action: "setchannelname", channelId: OTHER_CHANNEL, name: "x".repeat(101) },
  { action: "setchannelname", channelId: "invalid", name: "chat" },
  {
    action: "setchanneltopic",
    channelId: OTHER_CHANNEL,
    topic: "x".repeat(1025),
  },
  { action: "setchanneltopic", channelId: OTHER_CHANNEL },
  { action: "setslowmode", channelId: OTHER_CHANNEL, seconds: -1 },
  { action: "setslowmode", channelId: OTHER_CHANNEL, seconds: 21601 },
  { action: "setslowmode", channelId: OTHER_CHANNEL, seconds: 1.5 },
  { action: "setslowmode", channelId: OTHER_CHANNEL, seconds: "5" },
  { action: "setchannelcategory", channelId: OTHER_CHANNEL },
  { action: "setchannelcategory", channelId: OTHER_CHANNEL, categoryId: "bad" },
  { action: "warn", userId: TARGET, reason: "" },
  { action: "warn", userId: TARGET, reason: "Reason", durationMs: 0 },
  { action: "timeout", userId: TARGET, reason: "Reason" },
  {
    action: "timeout",
    userId: TARGET,
    reason: "Reason",
    durationMs: 29 * 86400000,
  },
  { action: "note", userId: "invalid", reason: "Note" },
  { action: "note", userId: TARGET, reason: "{unknown}" },
  { action: "note", userId: TARGET, reason: "Note", repeatable: "true" },
  { action: "note", userId: TARGET, reason: "Note", roleId: ROLE },
  { action: "unwarn", userId: TARGET, reason: "Reason", caseNumber: -1 },
  {
    action: "ban",
    userId: TARGET,
    reason: "Reason",
    deleteMessageSeconds: 604801,
  },
  { action: "setnickname", userId: TARGET, nickname: "x".repeat(33) },
  { action: "reply", text: "x".repeat(2001) },
  { action: "reply", text: "Hi", userId: TARGET },
  {
    action: "note",
    userId: TARGET,
    reason: "Note",
    successMessage: "x".repeat(2001),
  },
  { action: "sequence", actions: [] },
  {
    action: "sequence",
    actions: Array(11).fill({ action: "reply", text: "Hi" }),
  },
  {
    action: "sequence",
    actions: [{ action: "sequence", actions: [{ action: "reply", text: "Hi" }] }],
  },
  { action: "sequence", actions: [{ action: "go", target: 0 }] },
  { action: "go", target: 0, repeatable: true },
])("action schemas reject invalid configuration: %j", (action) => {
  expect(() =>
    validator.responses([
      {
        type: "TEXT",
        text: "Hi",
        stage: 0,
        buttons: [{ label: "Apply", ...action }],
      },
    ]),
  ).toThrow();
});

test("expanded sequences validate all text and target IDs before applying anything", async () => {
  const s = setup({
    action: "sequence",
    actions: [
      { action: "note", userId: TARGET_VARIABLE, reason: "Note" },
      { action: "setnickname", userId: TARGET_VARIABLE, nickname: "{args.1}" },
    ],
  });
  s.ctx.args[1] = "x".repeat(33);
  await expect(s.execute()).rejects.toThrow("32");
  expect(s.createCase).not.toHaveBeenCalled();
  const note = setup({
    action: "note",
    userId: TARGET_VARIABLE,
    reason: "{args.1}",
  });
  note.ctx.args[1] = "x".repeat(1001);
  await expect(note.execute()).rejects.toThrow("1000");
  expect(note.createCase).not.toHaveBeenCalled();
  const badTarget = setup();
  badTarget.ctx.args[0] = "{user.id}";
  await expect(badTarget.execute()).rejects.toThrow("Discord ID");
});

test("nested guild references are validated and fixed targets block sharing; variable targets stay reusable", async () => {
  const s = setup({
    action: "sequence",
    actions: [
      { action: "setnickname", userId: TARGET, nickname: "Name" },
      { action: "sendmessage", channelId: OTHER_CHANNEL, text: "Hi" },
    ],
  });
  expect(hasServerActionReferences(s.ctx.command.content)).toBe(true);
  await validateGuildReferences(s.ctx.guild, [definition({ content: s.ctx.command.content })]);
  s.fetchMember.mockRejectedValue(new Error("Unknown member"));
  await expect(
    validateGuildReferences(s.ctx.guild, [definition({ content: s.ctx.command.content })]),
  ).rejects.toThrow("does not belong");
  const reusable = setup({
    action: "note",
    userId: TARGET_VARIABLE,
    reason: "Note",
  });
  expect(hasServerActionReferences(reusable.ctx.command.content)).toBe(false);
  const nestedRole = setup({
    action: "sequence",
    actions: [{ action: "addrole", roleId: ROLE }],
  });
  expect(hasServerActionReferences(nestedRole.ctx.command.content)).toBe(true);
});
