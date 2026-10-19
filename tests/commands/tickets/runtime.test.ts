import { beforeEach, expect, test, vi } from "vitest";
import {
  ChannelType,
  Collection,
  PermissionFlagsBits as P,
  PermissionsBitField,
  type OverwriteResolvable,
  type PermissionResolvable,
} from "discord.js";
import {
  runTicket,
  OPEN_TICKET_BUTTON,
  ticketOverwrites,
} from "../../../src/modules/tickets/discord/runtime.js";
import {
  parseTicketTopic,
  ticketTopic,
  type TicketRecord,
} from "../../../src/modules/tickets/domain/records.js";
import { currentApplication } from "../../../src/adapters/discord/context.js";
import { ticketLocksToken } from "../../../src/modules/tickets/index.js";

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), verified: vi.fn() }));
vi.mock("../../../src/adapters/prisma/client.js", () => ({ db: {} }));
vi.mock("../../../src/modules/guilds/discord/index.js", async (original) => ({
  ...(await original<object>()),
  guildConfigService: { getOrCreate: mocks.get, update: mocks.update },
  requireVerifiedOwnership: mocks.verified,
}));
const ids = {
  guild: "100000000000000001",
  owner: "100000000000000002",
  bot: "100000000000000003",
  support: "100000000000000004",
  category: "100000000000000005",
  channel: "100000000000000006",
  other: "100000000000000007",
  staff: "100000000000000008",
};
const record: TicketRecord = {
  botId: ids.bot,
  ownerId: ids.owner,
  supportRoleId: ids.support,
  state: "open",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verified.mockResolvedValue(true);
  mocks.get.mockResolvedValue({
    ticketSettings: { enabled: true, categoryId: ids.category, supportRoleId: ids.support },
  });
  currentApplication().resolve(ticketLocksToken).clear();
});

function fixture(
  action: string,
  userId: string = ids.owner,
  options: Record<string, unknown> = {},
) {
  const actor = {
    id: userId,
    permissions: new PermissionsBitField(0n),
    roles: { cache: new Collection<string, unknown>(), highest: { position: 10 } },
  };
  const bot = {
    id: ids.bot,
    permissions: new PermissionsBitField(PermissionsBitField.All),
    roles: { highest: { position: 30 } },
  };
  const target = {
    id: ids.other,
    permissions: new PermissionsBitField(0n),
    roles: { cache: new Collection<string, unknown>() },
  };
  const category = {
    id: ids.category,
    type: ChannelType.GuildCategory,
    permissionsFor: () => new PermissionsBitField(PermissionsBitField.All),
  };
  const overwriteCache = new Collection<
    string,
    { id: string; type: number; allow: PermissionsBitField; deny: PermissionsBitField }
  >();
  for (const raw of ticketOverwrites(ids.guild, record)) {
    const overwrite = raw as {
      id: string;
      type: number;
      allow?: PermissionResolvable;
      deny?: PermissionResolvable;
    };
    overwriteCache.set(overwrite.id, {
      id: overwrite.id,
      type: overwrite.type,
      allow: new PermissionsBitField(overwrite.allow),
      deny: new PermissionsBitField(overwrite.deny),
    });
  }
  const channel = {
    id: ids.channel,
    type: ChannelType.GuildText,
    topic: ticketTopic(record),
    permissionsFor: vi.fn().mockReturnValue(new PermissionsBitField(PermissionsBitField.All)),
    permissionOverwrites: { cache: overwriteCache, edit: vi.fn() },
    send: vi.fn(),
    delete: vi.fn(),
    edit: vi.fn(),
  };
  const channels = new Collection<string, typeof channel | typeof category>([
    [ids.category, category],
  ]);
  const support = {
    id: ids.support,
    managed: false,
    comparePositionTo: (other: { position: number }) => 5 - other.position,
  };
  const guild = {
    id: ids.guild,
    ownerId: ids.staff,
    members: {
      fetch: vi
        .fn()
        .mockImplementation(({ user }) => Promise.resolve(user === userId ? actor : target)),
      fetchMe: vi.fn().mockResolvedValue(bot),
    },
    channels: {
      fetch: vi
        .fn()
        .mockImplementation((id?: string) =>
          Promise.resolve(id ? (id === ids.channel ? channel : channels.get(id)) : channels),
        ),
      create: vi.fn().mockImplementation(async () => {
        channels.set(channel.id, channel);
        return channel;
      }),
    },
    roles: { fetch: vi.fn().mockResolvedValue(support) },
  };
  const input = {
    guild,
    guildId: guild.id,
    channelId: channel.id,
    user: { id: userId },
    deferred: false,
    replied: false,
    inCachedGuild: () => true,
    isButton: () => false,
    customId: OPEN_TICKET_BUTTON,
    message: { author: { id: ids.bot } },
    deferReply: vi.fn(),
    editReply: vi.fn(),
    options: {
      getSubcommand: () => action,
      getString: (key: string) => options[key] ?? null,
      getBoolean: (key: string) => options[key] ?? null,
      getChannel: () => ({ id: ids.category }),
      getRole: () => ({ id: ids.support }),
      getUser: () => ({ id: target.id }),
    },
  };
  return { input, guild, channel, channels, actor, bot, support, target };
}
const run = (f: ReturnType<typeof fixture>) => runTicket(f.input as never);
const reply = (f: ReturnType<typeof fixture>) =>
  f.input.editReply.mock.calls.at(-1)?.[0]?.content as string;

test("opens a private ticket with explicit permissions and a durable topic", async () => {
  const f = fixture("open", ids.owner, { subject: "Need help @everyone" });
  await run(f);
  expect(f.guild.channels.create).toHaveBeenCalledWith(
    expect.objectContaining({
      parent: ids.category,
      topic: ticketTopic(record),
      permissionOverwrites: expect.arrayContaining([
        expect.objectContaining({ id: ids.guild, deny: expect.arrayContaining([P.ViewChannel]) }),
      ]),
    }),
  );
  expect(f.channel.send).toHaveBeenCalledWith(
    expect.objectContaining({ allowedMentions: { parse: [] } }),
  );
  expect(reply(f)).toContain(ids.channel);
});

test("finds existing tickets from Discord after a process restart", async () => {
  const f = fixture("open");
  f.channels.set(f.channel.id, f.channel);
  await run(f);
  expect(f.guild.channels.create).not.toHaveBeenCalled();
  expect(reply(f)).toContain("already have an open ticket");
});

test("concurrent opens cannot create duplicate channels", async () => {
  const f = fixture("open");
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.guild.channels.create.mockImplementationOnce(async () => {
    await pending;
    f.channels.set(f.channel.id, f.channel);
    return f.channel;
  });
  const first = run(f);
  await vi.waitFor(() => expect(f.guild.channels.create).toHaveBeenCalledOnce());
  const second = fixture("open");
  await run(second);
  expect(second.guild.channels.create).not.toHaveBeenCalled();
  expect(reply(second)).toContain("in progress");
  expect(currentApplication().resolve(ticketLocksToken).size).toBe(1);
  release();
  await first;
  expect(currentApplication().resolve(ticketLocksToken).size).toBe(0);
});

test("a failed create releases the lock for retry", async () => {
  const f = fixture("open");
  f.guild.channels.create.mockRejectedValueOnce(new Error("Discord failure"));
  await run(f);
  await run(f);
  expect(f.guild.channels.create).toHaveBeenCalledTimes(2);
  expect(currentApplication().resolve(ticketLocksToken).size).toBe(0);
});

test("closed tickets do not prevent opening a new one", async () => {
  const f = fixture("open");
  f.channel.topic = ticketTopic({ ...record, state: "closed" });
  f.channels.set(f.channel.id, f.channel);
  await run(f);
  expect(f.guild.channels.create).toHaveBeenCalledOnce();
});

test("welcome delivery failure leaves the channel discoverable", async () => {
  const f = fixture("open");
  f.channel.send.mockRejectedValue(new Error("delivery failed"));
  await run(f);
  await run(f);
  expect(f.guild.channels.create).toHaveBeenCalledOnce();
  expect(reply(f)).toContain("already have");
});

test("unverified servers cannot execute buttons or commands", async () => {
  mocks.verified.mockResolvedValue(false);
  const f = fixture("open");
  f.input.isButton = () => true;
  await run(f);
  expect(mocks.get).not.toHaveBeenCalled();
  expect(f.guild.channels.create).not.toHaveBeenCalled();
  expect(f.input.deferReply).toHaveBeenCalledOnce();
});

test("persistent panel buttons enforce command role restrictions", async () => {
  mocks.get.mockResolvedValue({
    ticketSettings: { enabled: true, categoryId: ids.category, supportRoleId: ids.support },
    commandRoleAccess: { ticket: { allowedRoleIds: [ids.support], deniedRoleIds: [] } },
  });
  const f = fixture("open");
  f.input.isButton = () => true;
  await run(f);
  expect(f.guild.channels.create).not.toHaveBeenCalled();
  expect(reply(f)).toContain("allowed roles");
});

test("rejects panels authored by another account", async () => {
  const f = fixture("open");
  f.input.isButton = () => true;
  f.input.message.author.id = ids.other;
  await run(f);
  expect(f.guild.channels.create).not.toHaveBeenCalled();
});

test("disabled tickets reject old panel buttons", async () => {
  mocks.get.mockResolvedValue({
    ticketSettings: { enabled: false, categoryId: ids.category, supportRoleId: ids.support },
  });
  const f = fixture("open");
  f.input.isButton = () => true;
  await run(f);
  expect(f.guild.channels.create).not.toHaveBeenCalled();
  expect(reply(f)).toContain("disabled");
});

test.each(["setup", "panel", "disable"])(
  "ordinary members cannot use staff action %s",
  async (action) => {
    const f = fixture(action);
    await run(f);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(f.channel.send).not.toHaveBeenCalled();
    expect(reply(f)).toContain("Manage Server");
  },
);

test("setup persists independent per-server settings", async () => {
  const f = fixture("setup", ids.staff);
  await run(f);
  expect(mocks.update).toHaveBeenCalledWith(ids.guild, {
    ticketSettings: { enabled: true, categoryId: ids.category, supportRoleId: ids.support },
  });
});

test("setup refuses everyone and managed support roles", async () => {
  for (const kind of ["everyone", "managed"]) {
    const f = fixture("setup", ids.staff);
    if (kind === "everyone") f.support.id = ids.guild;
    else f.support.managed = true;
    await run(f);
    expect(mocks.update).not.toHaveBeenCalled();
  }
});

test("missing bot permissions prevent ticket creation", async () => {
  const f = fixture("open");
  f.bot.permissions.remove([P.ManageRoles, P.Administrator]);
  await run(f);
  expect(f.guild.channels.create).not.toHaveBeenCalled();
});

test("removing participants cannot remove the ticket owner or support access", async () => {
  const owner = fixture("remove", ids.staff);
  owner.target.id = ids.owner;
  await run(owner);
  expect(owner.channel.permissionOverwrites.edit).not.toHaveBeenCalled();
  const support = fixture("remove", ids.staff);
  support.target.roles.cache.set(ids.support, {});
  await run(support);
  expect(support.channel.permissionOverwrites.edit).not.toHaveBeenCalled();
});

test("false confirmation preserves closed ticket history", async () => {
  const f = fixture("delete", ids.staff, { confirm: false });
  f.channel.topic = ticketTopic({ ...record, state: "closed" });
  await run(f);
  expect(f.channel.delete).not.toHaveBeenCalled();
});

test("the owner can close a ticket and every participant becomes read only", async () => {
  const f = fixture("close");
  f.channel.permissionOverwrites.cache.set(ids.other, {
    id: ids.other,
    type: 1,
    allow: new PermissionsBitField([P.ViewChannel, P.SendMessages, P.CreatePublicThreads]),
    deny: new PermissionsBitField(0n),
  });
  await run(f);
  expect(f.channel.edit).toHaveBeenCalledOnce();
  const update = f.channel.edit.mock.calls[0][0];
  expect(parseTicketTopic(update.topic)?.state).toBe("closed");
  for (const raw of update.permissionOverwrites as OverwriteResolvable[]) {
    const overwrite = raw as { id: string; allow: PermissionsBitField; deny: PermissionsBitField };
    if (overwrite.id === ids.bot) continue;
    expect(overwrite.allow.has(P.SendMessages, false)).toBe(false);
    expect(
      overwrite.deny.has(
        [P.SendMessages, P.SendMessagesInThreads, P.CreatePublicThreads, P.CreatePrivateThreads],
        false,
      ),
    ).toBe(true);
  }
  expect(f.channel.delete).not.toHaveBeenCalled();
});

test("unrelated members cannot close a ticket", async () => {
  const f = fixture("close", ids.other);
  await run(f);
  expect(f.channel.edit).not.toHaveBeenCalled();
});

test("support can add and remove extra participants", async () => {
  for (const action of ["add", "remove"]) {
    const f = fixture(action, ids.staff);
    await run(f);
    expect(f.channel.permissionOverwrites.edit).toHaveBeenCalledWith(
      f.target,
      expect.objectContaining({ ViewChannel: action === "add", SendMessages: action === "add" }),
      expect.any(Object),
    );
  }
});

test("ticket owners cannot grant additional participant access", async () => {
  const f = fixture("add");
  await run(f);
  expect(f.channel.permissionOverwrites.edit).not.toHaveBeenCalled();
});

test("only closed tickets with true confirmation can be deleted", async () => {
  const f = fixture("delete", ids.staff, { confirm: true });
  await run(f);
  expect(f.channel.delete).not.toHaveBeenCalled();
  f.channel.topic = ticketTopic({ ...record, state: "closed" });
  await run(f);
  expect(f.channel.delete).toHaveBeenCalledOnce();
});

test("refuses ordinary channels and another bot's ticket records", async () => {
  for (const topic of ["General discussion", ticketTopic({ ...record, botId: ids.other })]) {
    const f = fixture("close");
    f.channel.topic = topic;
    await run(f);
    expect(f.channel.edit).not.toHaveBeenCalled();
  }
});

test("ticket topic parsing rejects malformed records", () => {
  expect(parseTicketTopic(ticketTopic(record))).toEqual(record);
  for (const value of [null, "", "centerify-ticket:v1:invalid", `${ticketTopic(record)}:extra`])
    expect(parseTicketTopic(value)).toBeNull();
});
