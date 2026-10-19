import { expect, test, vi } from "vitest";
import { ChannelType, PermissionFlagsBits as P, PermissionsBitField } from "discord.js";
import {
  RoleCommand,
  parseRolePermissions,
} from "../../../src/modules/management/discord/commands/role.js";
import { ChannelCommand } from "../../../src/modules/management/discord/commands/channel.js";
import { ServerConfigCommand } from "../../../src/modules/management/discord/commands/serverconfig.js";
vi.mock("../../../src/adapters/prisma/client.js", () => ({ db: {} }));

function fixture(sub: string, options: Record<string, unknown> = {}) {
  const highest = (position: number) => ({
    position,
    comparePositionTo: (other: { position: number }) => position - other.position,
  });
  const actor = {
    id: "actor",
    permissions: new PermissionsBitField(P.ManageRoles | P.ManageChannels | P.ManageGuild),
    roles: { highest: highest(20) },
  };
  const bot = {
    id: "bot",
    permissions: new PermissionsBitField(PermissionsBitField.All),
    roles: { highest: highest(30) },
  };
  const role = {
    id: "role",
    managed: false,
    permissions: new PermissionsBitField(0n),
    comparePositionTo: (other: { position: number }) => 5 - other.position,
    edit: vi.fn().mockResolvedValue({ id: "role" }),
    delete: vi.fn(),
  };
  const channel = {
    id: "channel",
    type: ChannelType.GuildText,
    topic: null as string | null,
    isThread: () => false,
    permissionsFor: vi.fn().mockReturnValue(new PermissionsBitField(PermissionsBitField.All)),
    edit: vi.fn(),
    delete: vi.fn(),
    setRateLimitPerUser: vi.fn(),
  };
  const target = { id: "target", roles: { highest: highest(10), add: vi.fn(), remove: vi.fn() } };
  const guild = {
    id: "guild",
    ownerId: "owner",
    members: {
      fetch: vi
        .fn()
        .mockImplementation(({ user }) => Promise.resolve(user === "actor" ? actor : target)),
      fetchMe: vi.fn().mockResolvedValue(bot),
    },
    roles: {
      fetch: vi.fn().mockResolvedValue(role),
      create: vi.fn().mockResolvedValue({ id: "new-role" }),
    },
    channels: {
      fetch: vi.fn().mockResolvedValue(channel),
      create: vi.fn().mockResolvedValue({ id: "new-channel" }),
    },
    edit: vi.fn(),
  };
  const input = {
    guild,
    guildId: guild.id,
    channelId: "invocation",
    commandName: "role",
    user: { id: actor.id },
    inCachedGuild: () => true,
    deferred: false,
    replied: false,
    deferReply: vi.fn(),
    editReply: vi.fn(),
    options: {
      getSubcommand: () => sub,
      getString: (key: string) => options[key] ?? null,
      getBoolean: (key: string) => options[key] ?? null,
      getInteger: (key: string) => options[key] ?? null,
      getChannel: (key: string) => options[key] ?? (key === "channel" ? { id: channel.id } : null),
      getRole: () => ({ id: role.id }),
      getUser: () => ({ id: target.id }),
    },
  };
  return { input, actor, bot, guild, role, channel, target };
}
const runRole = (f: ReturnType<typeof fixture>) =>
  RoleCommand.prototype.chatInputRun.call({} as RoleCommand, f.input as never);
const runChannel = (f: ReturnType<typeof fixture>) =>
  ChannelCommand.prototype.chatInputRun.call({} as ChannelCommand, f.input as never);

test("creates roles without inheriting Discord's default permissions", async () => {
  const f = fixture("create", { name: "Members", color: "#5865F2", mentionable: false });
  await runRole(f);
  expect(f.guild.roles.create).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Members",
      permissions: 0n,
      colors: { primaryColor: 0x5865f2 },
      mentionable: false,
    }),
  );
});

test("refreshes actor and bot permissions before rejecting unauthorized mutations", async () => {
  const f = fixture("delete", { confirm: true });
  f.actor.permissions = new PermissionsBitField(0n);
  await runRole(f);
  expect(f.guild.members.fetch).toHaveBeenCalledWith({ user: "actor", force: true });
  expect(f.role.delete).not.toHaveBeenCalled();
  expect(f.input.editReply).toHaveBeenCalledWith(
    expect.objectContaining({ content: expect.stringContaining("permission") }),
  );
});

test.each(["Administrator", "ManageWebhooks"])(
  "refuses permission escalation through %s",
  async (permissions) => {
    const f = fixture("edit", { permissions });
    await runRole(f);
    expect(f.role.edit).not.toHaveBeenCalled();
    expect(f.input.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("only grant") }),
    );
  },
);

test("refuses assigning an existing privileged role", async () => {
  const f = fixture("add");
  f.role.permissions = new PermissionsBitField(P.Administrator);
  await runRole(f);
  expect(f.target.roles.add).not.toHaveBeenCalled();
});

test.each(["managed", "hierarchy", "everyone", "target-hierarchy"])(
  "enforces role protection: %s",
  async (kind) => {
    const f = fixture("add");
    if (kind === "managed") f.role.managed = true;
    if (kind === "hierarchy") f.role.comparePositionTo = () => 0;
    if (kind === "everyone") f.role.id = f.guild.id;
    if (kind === "target-hierarchy") f.target.roles.highest.comparePositionTo = () => 0;
    await runRole(f);
    expect(f.target.roles.add).not.toHaveBeenCalled();
  },
);

test("assigns and removes a permitted role on a lower member", async () => {
  for (const sub of ["add", "remove"] as const) {
    const f = fixture(sub);
    await runRole(f);
    expect(f.target.roles[sub]).toHaveBeenCalledWith(f.role, expect.stringContaining("actor"));
  }
});

test("deletion requires explicit true confirmation", async () => {
  for (const run of [runRole, runChannel]) {
    const f = fixture("delete", { confirm: false });
    await run(f);
    expect(f.role.delete).not.toHaveBeenCalled();
    expect(f.channel.delete).not.toHaveBeenCalled();
  }
});

test("confirmed deletion calls Discord with an audit reason", async () => {
  const f = fixture("delete", { confirm: true });
  await runChannel(f);
  expect(f.channel.delete).toHaveBeenCalledWith(expect.stringContaining("actor"));
});

test("channel permission overwrites cannot be bypassed", async () => {
  const f = fixture("edit", { name: "secret" });
  f.channel.permissionsFor.mockReturnValue(new PermissionsBitField(0n));
  await runChannel(f);
  expect(f.channel.edit).not.toHaveBeenCalled();
});

test("protects ticket topics from general channel edits", async () => {
  const f = fixture("edit", { topic: "overwrite" });
  f.channel.topic = "centerify-ticket:v1:record";
  await runChannel(f);
  expect(f.channel.edit).not.toHaveBeenCalled();
});

test("sets zero-second slowmode and preserves explicit false role settings", async () => {
  const f = fixture("slowmode", { seconds: 0 });
  await runChannel(f);
  expect(f.channel.setRateLimitPerUser).toHaveBeenCalledWith(0, expect.any(String));
  const role = fixture("edit", { hoist: false, mentionable: false, permissions: "" });
  await runRole(role);
  expect(role.role.edit).toHaveBeenCalledWith(
    expect.objectContaining({
      hoist: false,
      mentionable: false,
      permissions: new PermissionsBitField(0n),
    }),
  );
});

test("server configuration supports verification level zero", async () => {
  const f = fixture("", { verification: 0 });
  await ServerConfigCommand.prototype.chatInputRun.call(
    {} as ServerConfigCommand,
    f.input as never,
  );
  expect(f.guild.edit).toHaveBeenCalledWith(expect.objectContaining({ verificationLevel: 0 }));
});

test("Discord failures do not expose raw error text", async () => {
  const f = fixture("create", { name: "Test" });
  f.guild.roles.create.mockRejectedValue(new Error("private-token"));
  await runRole(f);
  expect(f.input.editReply.mock.calls[0][0].content).not.toContain("private-token");
});

test("permission input handles multiple names and rejects unknown properties", () => {
  expect(parseRolePermissions("ViewChannel, SendMessages")).toBe(P.ViewChannel | P.SendMessages);
  expect(() => parseRolePermissions("__proto__")).toThrow("Unknown permission");
});
