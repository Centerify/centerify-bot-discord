import { dispatchDiscordEvent } from "../../src/adapters/discord/modules.js";
import { bindApplication } from "../../src/adapters/discord/context.js";
import { loggerToken } from "../../src/core/index.js";
let unbindTestClient: (() => void) | undefined;
import { startTestApplication } from "../helpers/application.js";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { container } from "@sapphire/framework";
import {
  Collection,
  ComponentType,
  MessageFlags,
  PermissionFlagsBits,
  PermissionsBitField,
  type Client,
  type Guild,
  type GuildMember,
  type Message,
} from "discord.js";

// Only Discord delivery is simulated. Commands, Settings, the editor, ownership,
// validation, resolution, execution, cooldowns and PostgreSQL use production code.
const url = process.env.TEST_DATABASE_URL;
let testApplication: Awaited<ReturnType<typeof startTestApplication>> | undefined;
const prefix = `sharing-e2e-${randomUUID()}`;
const ADMIN = "323456789012345678",
  USER = "423456789012345678";
const ids = ["source", "selected", "excluded", "future"].map(
  (name) => `${prefix}-${name}`,
);
let db: typeof import("../../src/adapters/prisma/client.js").db;
let ownership: typeof import("../../src/modules/guilds/discord/ownership.js").guildOwnershipService;
let runtime: typeof import("../../src/modules/custom-commands/discord/runtime.js");
let SettingsCommand: typeof import("../../src/modules/settings/discord/index.js").SettingsCommand;
let CustomCommand: typeof import("../../src/modules/custom-commands/discord/index.js").CustomCommand;
let previousClient: PropertyDescriptor | undefined;
let errorLog: ReturnType<typeof vi.spyOn> | undefined;
const guilds = new Collection<string, Guild>();
const client = {
  guilds: { cache: guilds, fetch: async (id: string) => guilds.get(id)! },
} as unknown as Client;
const collectors = new Set<{ stop(reason?: string): void }>();

function makeGuild(id: string, name: string) {
  const guild = {
    id,
    name,
    ownerId: ADMIN,
    client,
    memberCount: 3,
    iconURL: () => null,
    fetch: async () => guild,
    members: {
      me: null as GuildMember | null,
      fetch: vi.fn(async (input: { user: string } | string) =>
        members.get(typeof input === "string" ? input : input.user)!,
      ),
    },
    roles: { cache: new Collection() },
    channels: { cache: new Collection() },
  };
  const members = new Map<string, GuildMember>();
  for (const id of [ADMIN, USER, "bot"])
    members.set(id, {
      id,
      guild,
      user: { id, username: id === USER ? "Alex" : "Admin", bot: id === "bot" },
      displayName: id === USER ? "Alex" : "Admin",
      roles: { cache: new Collection() },
      permissions: new PermissionsBitField(
        id === USER
          ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
          : [PermissionFlagsBits.Administrator],
      ),
    } as unknown as GuildMember);
  guild.members.me = members.get("bot")!;
  guilds.set(id, guild as unknown as Guild);
  return { guild, members };
}
function channel(guild: Guild) {
  return {
    id: `channel-${guild.id}`,
    guildId: guild.id,
    name: "general",
    isThread: () => false,
    isDMBased: () => false,
    permissionsFor: (member: GuildMember) => member.permissions,
    send: vi.fn().mockResolvedValue(undefined),
  };
}
function interaction(guild: Guild, actor = ADMIN) {
  const callbacks = new Map<string, (...args: any[]) => any>();
  const collector = {
    ended: false,
    resetTimer: vi.fn(),
    on: (event: string, callback: (...args: any[]) => any) => {
      callbacks.set(event, callback);
      return collector;
    },
    stop: (reason = "finished") => {
      collector.ended = true;
      callbacks.get("end")?.([], reason);
    },
  };
  const message = { createMessageComponentCollector: () => collector };
  collectors.add(collector);
  const root = {
    id: randomUUID(),
    guild,
    guildId: guild.id,
    client,
    user: { id: actor },
    member: null as GuildMember | null,
    channel: channel(guild),
    deferred: false,
    replied: false,
    inCachedGuild: () => true,
    reply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(message),
    webhook: { editMessage: vi.fn().mockResolvedValue(undefined) },
    deferReply: vi.fn(async function (this: { deferred: boolean }) {
      this.deferred = true;
    }),
    deferUpdate: vi.fn(async function (this: { deferred: boolean }) {
      this.deferred = true;
    }),
    editReply: vi.fn(async function (
      this: { replied: boolean },
      _payload: any,
    ) {
      this.replied = true;
      return message;
    }),
  };
  return { root, collector, callbacks, message };
}
async function withMember(guild: Guild, actor = ADMIN) {
  const fixture = interaction(guild, actor);
  fixture.root.member = await guild.members.fetch({ user: actor });
  return fixture;
}
function customOptions(
  sub: string,
  values: Record<string, string | number | boolean> = {},
) {
  return {
    getSubcommand: () => sub,
    getString: (key: string) => values[key] ?? null,
    getBoolean: (key: string) => values[key] ?? null,
    getInteger: (key: string) => values[key] ?? null,
    getRole: () => null,
    getChannel: () => null,
  };
}
async function custom(
  guild: Guild,
  sub: string,
  values: Record<string, string | number | boolean>,
  actor = ADMIN,
) {
  const f = await withMember(guild, actor);
  await Object.create(CustomCommand.prototype).chatInputRun({
    ...f.root,
    options: customOptions(sub, values),
  });
  // A production command completes expected errors in its reply instead of throwing.
  return f;
}
function controls(f: Awaited<ReturnType<typeof withMember>>) {
  const payload = (f.root.editReply.mock.calls.at(-1) ?? f.root.followUp.mock.calls.at(-1))![0];
  const flatten = (items: any[]): any[] =>
    items.flatMap((item) => [item, ...flatten(item.components ?? [])]);
  return flatten(
    (payload.components ?? []).map((item: any) =>
      item.toJSON ? item.toJSON() : item,
    ),
  );
}
async function click(
  f: Awaited<ReturnType<typeof withMember>>,
  action: string,
  values?: string[],
) {
  const control = controls(f).find((item) =>
    item.custom_id?.endsWith(`:${action}`),
  );
  expect(control, `Control ${action} should be rendered: ${JSON.stringify(f.root.editReply.mock.calls)}`).toBeDefined();
  const item = await withMember(f.root.guild);
  const component = {
    ...item.root,
    customId: control.custom_id,
    values: values ?? [],
    isButton: () => values === undefined,
    isStringSelectMenu: () => values !== undefined,
    isChannelSelectMenu: () => false,
    isRoleSelectMenu: () => false,
  };
  await f.callbacks.get("collect")!(component);
  for (const [payload] of item.root.followUp.mock.calls as unknown as [any][])
    expect(payload.embeds?.[0]?.toJSON().title).toBe("Duplicate commands found");
  return item;
}
async function settings(guild: Guild) {
  const f = await withMember(guild);
  await Object.create(SettingsCommand.prototype).chatInputRun(f.root);
  const panel = await click(f, "custom-commands");
  expect(panel.root.editReply.mock.calls[0]![0].flags).toBe(
    MessageFlags.IsComponentsV2,
  );
  return panel;
}
async function prefixMessage(guild: Guild, content: string) {
  const member = await guild.members.fetch({ user: USER });
  const message = {
    guild,
    member,
    client,
    channel: channel(guild),
    content,
    author: member.user,
    webhookId: null,
    system: false,
    reply: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  await dispatchDiscordEvent(testApplication!.application, "messageCreate",
    message as unknown as Message,
  );
  return message;
}

// Workflows cover integration seams; lower-level edge cases live in their
// dedicated unit/repository suites instead of being repeated here.
describe.skipIf(!url)(
  "custom command sharing from Discord controls to PostgreSQL and execution",
  () => {
    beforeAll(async () => {
      process.env.DATABASE_URL = url!;
      testApplication = await startTestApplication();
      previousClient = Object.getOwnPropertyDescriptor(container, "client");
      Object.defineProperty(container, "client", {
        configurable: true,
        value: client,
      });
      unbindTestClient = bindApplication(client as unknown as import("discord.js").Client, testApplication.application);
      ({ db } = await import("../../src/adapters/prisma/client.js"));
      ({ guildOwnershipService: ownership } =
        await import("../../src/modules/guilds/discord/ownership.js"));
      runtime = await import("../../src/modules/custom-commands/discord/runtime.js");
      ({ SettingsCommand } =
        await import("../../src/modules/settings/discord/index.js"));
      ({ CustomCommand } = await import("../../src/modules/custom-commands/discord/index.js"));
    });
    beforeEach(async () => {
      const { logger } = await import("../../src/adapters/logging/runtime.js");
      errorLog = vi.spyOn(testApplication!.application.resolve(loggerToken), "error");
      guilds.clear();
      for (const [index, id] of ids.slice(0, 3).entries()) {
        runtime.customCommandService.invalidate(id);
        const { guild } = makeGuild(
          id,
          ["Source", "Selected", "Excluded"][index]!,
        );
        expect(await ownership.verify(guild as unknown as Guild, ADMIN)).toBe(
          true,
        );
      }
    });
    afterEach(async () => {
      const unexpectedErrors = errorLog?.mock.calls ?? [];
      errorLog?.mockRestore();
      for (const collector of collectors) collector.stop("test-complete");
      collectors.clear();
      if (db)
        await db.transaction(async (tx) => {
          for (const guildId of ids) {
            await tx.orm.public.CustomCommandName.where({
              guildId,
            }).deleteAll();
            await tx.orm.public.CustomCommandRestriction.where({
              guildId,
            }).deleteAll();
            await tx.orm.public.CustomCommand.where({ guildId }).deleteAll();
            await tx.orm.public.CustomResponse.where({ guildId }).deleteAll();
            await tx.orm.public.MemberXp.where({ guildId }).deleteAll();
            await tx.orm.public.GuildOwnership.where({ guildId }).deleteAll();
            await tx.orm.public.GuildConfig.where({ guildId }).deleteAll();
          }
        });
      expect(
        unexpectedErrors,
        "Expected denials must not hide runtime or database failures",
      ).toEqual([]);
    });
    afterAll(async () => {
      try {
        unbindTestClient?.();
        await testApplication?.stop();
        if (db) await db.close();
      } finally {
        if (previousClient)
          Object.defineProperty(container, "client", previousClient);
        else Reflect.deleteProperty(container, "client");
      }
    });
    test("create, customize and select servers through Settings; prefix and slash use one persisted response", async () => {
      const source = guilds.get(ids[0]!)!,
        selected = guilds.get(ids[1]!)!,
        excluded = guilds.get(ids[2]!)!;
      const created = await custom(source, "create", {
        name: "greet",
        aliases: "hello",
        response: "Initial",
      });
      expect(created.root.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("created"),
        }),
      );
      const panel = await settings(source);
      const editor = await click(panel, "customize");
      const responseControl = controls(editor).find((item) =>
        item.custom_id?.endsWith(":markdown"),
      );
      expect(responseControl, JSON.stringify(editor.root.editReply.mock.calls)).toBeDefined();
      const modal = await withMember(source);
      const text = "Hello {user.name} in {guild.name}: {args}";
      const button = {
        ...modal.root,
        customId: responseControl.custom_id,
        isButton: () => true,
        showModal: vi.fn(),
        awaitModalSubmit: vi.fn(
          async ({ filter }: { filter: (item: unknown) => boolean }) => {
            const submitted = {
              ...modal.root,
              customId: button.showModal.mock.calls[0]![0].toJSON().custom_id,
              fields: { getTextInputValue: () => text },
            };
            expect(filter(submitted)).toBe(true);
            return submitted;
          },
        ),
      };
      await editor.callbacks.get("collect")!(button);
      expect(modal.root.editReply).toHaveBeenCalledWith(
        "Custom command updated.",
      );
      await click(panel, "refresh");
      await click(panel, "scope", ["selected"]);
      await click(panel, "servers", [selected.id]);
      const serverSelect = controls(panel).find((item) =>
        item.custom_id?.endsWith(":servers"),
      );
      expect(serverSelect.type).toBe(ComponentType.StringSelect);
      await click(panel, "save");
      // Reopening proves persistence independently of the panel's in-memory state.
      const reopened = await settings(source);
      expect(
        controls(reopened)
          .find((item) => item.custom_id?.endsWith(":scope"))
          .options.find((option: any) => option.default).value,
      ).toBe("selected");
      expect(
        controls(reopened)
          .find((item) => item.custom_id?.endsWith(":servers"))
          .options.find((option: any) => option.default).value,
      ).toBe(selected.id);
      const prefix = await prefixMessage(selected, "!hello John Doe");
      expect(prefix.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "Hello Alex in Selected: John Doe",
          allowedMentions: {
            parse: [],
            users: [USER],
            roles: [],
            repliedUser: false,
          },
        }),
      );
      expect(
        (await prefixMessage(excluded, "!greet John")).reply,
      ).not.toHaveBeenCalled();
      const slash = await custom(
        selected,
        "run",
        { command: "greet", args: "Jane" },
        USER,
      );
      expect(slash.root.followUp).toHaveBeenCalledWith(
        expect.objectContaining({ content: "Hello Alex in Selected: Jane" }),
      );
      const stored = await db.orm.public.CustomCommand.where({
        guildId: source.id,
        name: "greet",
      }).first();
      expect(stored).toMatchObject({
        usageCount: 2,
        content: [{ type: "TEXT", text }],
      });
      expect(
        await db.orm.public.CustomCommand.where({ guildId: selected.id }).all(),
      ).toEqual([]);
      await click(reopened, "scope", ["server"]);
      await click(reopened, "save");
      expect(
        (await prefixMessage(selected, "!hello")).reply,
      ).not.toHaveBeenCalled();
      await click(panel, "close");
      await click(reopened, "close");
    }, 15_000);
    test("duplicate selections warn before persisting, Cancel leaves scope unchanged, and Proceed preserves local commands", async () => {
      const source = guilds.get(ids[0]!)!,
        selected = guilds.get(ids[1]!)!;
      await custom(source, "create", {
        name: "greet",
        aliases: "hello",
        response: "Shared",
      });
      await custom(selected, "create", { name: "hello", response: "Local" });
      const command = (
        await runtime.customCommandService.listCommands(source.id)
      )[0]!;
      const panel = await settings(source);
      await click(panel, "scope", ["selected"]);
      await click(panel, "servers", [selected.id]);
      const warning = await click(panel, "save");
      expect(await runtime.customCommandSharingService.get(command)).toBeNull();
      const cancel = controls(warning).find((item) => item.label === "Cancel").custom_id.split(":").at(-1);
      await click(warning, cancel);
      expect(await runtime.customCommandSharingService.get(command)).toBeNull();
      const nextWarning = await click(panel, "save");
      const proceed = controls(nextWarning)
        .find((item) => item.label === "Keep Existing")
        .custom_id.split(":")
        .at(-1);
      await click(nextWarning, proceed);
      expect(
        await runtime.customCommandSharingService.get(command),
      ).toMatchObject({ scope: "selected", selectedGuildIds: selected.id });
      expect(
        (await prefixMessage(selected, "!hello")).reply,
      ).toHaveBeenCalledWith(expect.objectContaining({ content: "Local" }));
      expect(
        (await prefixMessage(selected, "!greet")).reply,
      ).toHaveBeenCalledWith(expect.objectContaining({ content: "Shared" }));
      expect(
        await runtime.customCommandService.listCommands(selected.id),
      ).toHaveLength(1);
      await click(panel, "close");
    }, 15_000);
    test("Replace Existing removes the local definition and aliases and runs the global command", async () => {
      const source = guilds.get(ids[0]!)!, selected = guilds.get(ids[1]!)!;
      await custom(source, "create", { name: "greet", aliases: "hello", response: "Shared" });
      await custom(selected, "create", { name: "hello", aliases: "oldalias", response: "Local" });
      // Populate the local execution cache before replacement.
      expect((await prefixMessage(selected, "!hello")).reply).toHaveBeenCalledWith(expect.objectContaining({ content: "Local" }));
      const panel = await settings(source);
      await click(panel, "scope", ["selected"]);
      await click(panel, "servers", [selected.id]);
      const warning = await click(panel, "save");
      const replace = controls(warning).find((item) => item.label === "Replace Existing");
      expect(replace.disabled).toBe(false);
      await click(warning, replace.custom_id.split(":").at(-1));
      expect(await runtime.customCommandService.listCommands(selected.id)).toHaveLength(0);
      expect(await db.orm.public.CustomCommandName.where({ guildId: selected.id }).all()).toHaveLength(0);
      expect((await prefixMessage(selected, "!hello")).reply).toHaveBeenCalledWith(expect.objectContaining({ content: "Shared" }));
      expect((await prefixMessage(selected, "!oldalias")).reply).not.toHaveBeenCalled();
      await click(panel, "close");
    }, 15_000);
    test("destination list and options expose the shared definition for editing and individual scope changes", async () => {
      const source = guilds.get(ids[0]!)!, selected = guilds.get(ids[1]!)!, other = guilds.get(ids[2]!)!;
      await custom(source, "create", { name: "shared-edit", response: "Original" });
      await custom(source, "create", { name: "unrelated", response: "Local only" });
      const definition = (await runtime.customCommandService.listCommands(source.id)).find((row) => row.name === "shared-edit")!;
      await runtime.customCommandSharingService.save(client, ADMIN, definition, "selected", [selected.id]);
      const listed = await custom(selected, "list", {});
      expect(listed.root.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("shared-edit") }));
      const panel = await custom(selected, "options", {});
      expect(controls(panel).find((item) => item.custom_id?.endsWith(":customize-command")).options)
        .toContainEqual(expect.objectContaining({ value: String(definition.id) }));
      const editor = await click(panel, "customize");
      const templateControl = controls(editor).find((item) => item.custom_id?.endsWith(":markdown"));
      const modal = await withMember(selected);
      const button = {
        ...modal.root, customId: templateControl.custom_id, isButton: () => true, showModal: vi.fn(),
        awaitModalSubmit: vi.fn(async () => ({
          ...modal.root, fields: { getTextInputValue: () => ":::text\nOriginal\n:::\n:::text\nAdded from destination\n:::" },
        })),
      };
      await editor.callbacks.get("collect")!(button);
      expect((await runtime.customCommandService.getCommand(source.id, "shared-edit"))?.content).toHaveLength(2);
      expect((await runtime.resolveExecutableCustomCommand(client, selected, "shared-edit"))?.content).toHaveLength(2);
      expect(await db.orm.public.CustomCommand.where({ guildId: selected.id }).all()).toEqual([]);
      await click(panel, "only-command");
      await click(panel, "scope", ["all"]);
      await click(panel, "save");
      expect(await runtime.resolveExecutableCustomCommand(client, other, "shared-edit")).toMatchObject({ id: definition.id });
      expect(await runtime.resolveExecutableCustomCommand(client, other, "unrelated")).toBeNull();
      await click(panel, "scope", ["selected"]);
      await click(panel, "servers", [selected.id]);
      await click(panel, "save");
      expect(await runtime.resolveExecutableCustomCommand(client, other, "shared-edit")).toBeNull();
      expect(await runtime.resolveExecutableCustomCommand(client, selected, "shared-edit")).not.toBeNull();
    }, 15_000);
    test("all-server scope includes later installations, shares cooldowns, and stops after ownership changes", async () => {
      const source = guilds.get(ids[0]!)!,
        selected = guilds.get(ids[1]!)!;
      await custom(source, "create", {
        name: "broadcast",
        response: "Global in {guild.name}",
        cooldown: 3600,
        cooldown_scope: "GLOBAL_COMMAND",
      });
      const panel = await settings(source);
      const command = (
        await runtime.customCommandService.listCommands(source.id)
      ).find((item) => item.name === "broadcast")!;
      await click(panel, "command", [String(command.id)]);
      await click(panel, "scope", ["all"]);
      await click(panel, "save");
      const future = makeGuild(ids[3]!, "Future").guild as unknown as Guild;
      expect(await ownership.verify(future, ADMIN)).toBe(true);
      expect(
        (await prefixMessage(future, "!broadcast")).reply,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ content: "Global in Future" }),
      );
      const blockedByCooldown = await custom(
        selected,
        "run",
        { command: "broadcast" },
        USER,
      );
      expect(blockedByCooldown.root.followUp).not.toHaveBeenCalled();
      expect(blockedByCooldown.root.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("seconds"),
        }),
      );
      await custom(source, "create", {
        name: "verified-share",
        response: "Verified",
      });
      await click(panel, "refresh");
      const verifiedCommand = (
        await runtime.customCommandService.listCommands(source.id)
      ).find((item) => item.name === "verified-share")!;
      await click(panel, "command", [String(verifiedCommand.id)]);
      await click(panel, "scope", ["all"]);
      await click(panel, "save");
      expect(
        (await prefixMessage(selected, "!verified-share")).reply,
      ).toHaveBeenCalledOnce();
      source.ownerId = "new-owner";
      expect(
        (await prefixMessage(selected, "!verified-share")).reply,
      ).not.toHaveBeenCalled();
      const stored = await db.orm.public.CustomCommand.where({
        guildId: source.id,
        name: "verified-share",
      }).first();
      expect(stored?.usageCount).toBe(1);
      panel.collector.stop("test-complete");
    }, 15_000);
  },
);
