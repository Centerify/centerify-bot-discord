import { vi } from "vitest";
import { Command } from "@sapphire/framework";
import * as discord from "discord.js";
import { z } from "zod";
import type { PluginSdk } from "../../src/modules/plugins/discord/sdk.js";
import { Runtime } from "../../plugins/better-ticket/src/runtime.js";
export const ids = {
  guild: "100000000000000001",
  owner: "100000000000000002",
  bot: "100000000000000003",
  support: "100000000000000004",
  category: "100000000000000005",
  channel: "100000000000000006",
  other: "100000000000000007",
  manager: "100000000000000008",
  staff: "100000000000000009",
  log: "100000000000000010",
};
export function memorySdk() {
  const data = new Map<string, unknown>();
  const sdk: PluginSdk = {
    apiVersion: 1,
    Command,
    discord,
    z,
    storage: {
      async read(id) {
        return structuredClone(data.get(id) ?? null);
      },
      async update(id, operation) {
        const next = operation(structuredClone(data.get(id) ?? null));
        data.set(id, structuredClone(next.value));
        return next.result;
      },
    },
    authorize: vi.fn().mockResolvedValue(true),
    verified: vi.fn().mockResolvedValue(true),
    logError: vi.fn(),
  };
  return { sdk, data };
}
export function harness() {
  const { sdk, data } = memorySdk();
  const runtime = new Runtime(sdk);
  const member = (id: string, staff = false, manager = false) => ({
    id,
    user: { id, bot: false },
    permissions: new discord.PermissionsBitField(manager ? discord.PermissionsBitField.All : 0n),
    roles: {
      cache: new discord.Collection<string, unknown>(staff ? [[ids.support, {}]] : []),
      highest: { position: 20 },
    },
  });
  const owner = member(ids.owner),
    staff = member(ids.staff, true),
    manager = member(ids.manager, false, true),
    other = member(ids.other);
  const bot = {
    ...member(ids.bot),
    permissions: new discord.PermissionsBitField(discord.PermissionsBitField.All),
    roles: { cache: new discord.Collection<string, unknown>(), highest: { position: 30 } },
  };
  const members = new Map([
    [owner.id, owner],
    [staff.id, staff],
    [manager.id, manager],
    [other.id, other],
    [bot.id, bot],
  ]);
  const permissionsFor = vi
    .fn()
    .mockImplementation(
      (subject: { id: string }) =>
        new discord.PermissionsBitField(
          subject.id === ids.guild ? 0n : discord.PermissionsBitField.All,
        ),
    );
  const log = {
    id: ids.log,
    type: discord.ChannelType.GuildText,
    permissionsFor,
    send: vi.fn().mockResolvedValue({
      id: "100000000000000020",
      url: `https://discord.com/channels/${ids.guild}/${ids.log}/100000000000000020`,
    }),
  };
  const category = { id: ids.category, type: discord.ChannelType.GuildCategory, permissionsFor };
  const channel = {
    id: ids.channel,
    type: discord.ChannelType.GuildText,
    parentId: ids.category,
    topic: "",
    permissionsFor,
    send: vi.fn().mockResolvedValue({ id: "100000000000000021" }),
    edit: vi.fn(),
    delete: vi.fn(),
    setName: vi.fn(),
    permissionOverwrites: { edit: vi.fn() },
    messages: { fetch: vi.fn().mockResolvedValue(new discord.Collection()) },
  };
  const channels = new discord.Collection<string, unknown>([
    [category.id, category],
    [log.id, log],
  ]);
  const role = {
    id: ids.support,
    managed: false,
    comparePositionTo: (other: { position: number }) => 5 - other.position,
  };
  const guild = {
    id: ids.guild,
    ownerId: ids.manager,
    roles: { everyone: { id: ids.guild }, fetch: vi.fn().mockResolvedValue(role) },
    members: {
      fetch: vi
        .fn()
        .mockImplementation(({ user }: { user: string }) => Promise.resolve(members.get(user))),
      fetchMe: vi.fn().mockResolvedValue(bot),
    },
    channels: {
      fetch: vi
        .fn()
        .mockImplementation((id?: string) => Promise.resolve(id ? channels.get(id) : channels)),
      create: vi.fn().mockImplementation(async (options: { topic: string }) => {
        channel.topic = options.topic;
        channels.set(channel.id, channel);
        return channel;
      }),
    },
  };
  const profile = {
    key: "support",
    title: "Support",
    categoryId: ids.category,
    supportRoleIds: [ids.support],
    transcriptChannelId: ids.log,
    questions: [],
    cooldownSeconds: 0,
  };
  const input = (
    action: string,
    userId: string = ids.owner,
    options: Record<string, unknown> = {},
  ) => ({
    guild,
    guildId: guild.id,
    channelId: channel.id,
    user: { id: userId },
    client: { user: { id: ids.bot } },
    deferred: true,
    replied: false,
    inCachedGuild: () => true,
    isButton: () => false,
    isModalSubmit: () => false,
    isStringSelectMenu: () => false,
    deferReply: vi.fn(),
    editReply: vi.fn(),
    reply: vi.fn(),
    showModal: vi.fn(),
    message: { author: { id: ids.bot } },
    options: {
      getSubcommand: () => action,
      getString: (key: string) => options[key] ?? null,
      getBoolean: (key: string) => options[key] ?? null,
      getInteger: (key: string) => options[key] ?? null,
      getUser: (key: string) => (options[key] ? { id: options[key] } : null),
      getChannel: (key: string) => ({ id: key === "transcripts" ? ids.log : ids.category }),
      getRole: () => ({ id: ids.support }),
    },
  });
  const open = async () => {
    await runtime.store.saveProfile(ids.guild, profile);
    await runtime.command(input("open", ids.owner, { profile: "support" }) as never);
    return runtime.store.channel(ids.guild, ids.channel);
  };
  return {
    sdk,
    data,
    runtime,
    guild,
    channel,
    channels,
    category,
    log,
    owner,
    staff,
    manager,
    other,
    bot,
    profile,
    input,
    open,
  };
}
