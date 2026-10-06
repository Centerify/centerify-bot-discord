import { beforeEach, expect, test, vi } from "vitest";
import {
  MessageFlags,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  list: vi.fn(),
  execute: vi.fn(),
  ownership: vi.fn(),
  legacyList: vi.fn(),
  editor: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("../../../src/services/customCommands/runtime.js", () => ({
  resolveExecutableCustomCommand: (
    _client: unknown,
    guild: { id: string },
    name: string,
  ) => mocks.find(guild.id, name),
  customCommandService: {
    invalidate: vi.fn(),
    getCommand: mocks.get,
    getCommandByNameOrAlias: mocks.find,
    createCommand: mocks.create,
    updateCommand: mocks.update,
    listCommands: mocks.list,
  },
  customCommandExecutor: { execute: mocks.execute },
  customCommandSharingService: { listAvailable: mocks.list },
}));
vi.mock("../../../src/services/customCommands/editor.js", () => ({
  openCustomCommandEditor: mocks.editor,
}));
vi.mock("../../../src/services/customCommands/settings.js", () => ({
  openCustomCommandSettings: mocks.settings,
}));
vi.mock("../../../src/services/customResponseService.js", () => ({
  customResponseService: { list: mocks.legacyList },
}));
vi.mock("../../../src/services/guildOwnershipService.js", () => ({
  requireVerifiedOwnership: mocks.ownership,
}));
vi.mock("../../../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
import { CustomCommand } from "../../../src/commands/admin/custom.js";
import {
  commandInfo,
  commandPatch,
  showCommandList,
  handleCustomManagement,
} from "../../../src/services/customCommands/management.js";
import { definition, record, USER, CHANNEL } from "./fixtures.js";
const command = Object.create(CustomCommand.prototype) as CustomCommand;
function fixture(
  sub: string,
  values: Record<string, string | number | boolean | null> = {},
  admin = true,
) {
  const guild = {
    id: "guild-a",
    ownerId: "owner",
    members: { fetch: vi.fn() },
  };
  const member = {
    id: USER,
    guild,
    permissions: {
      has: (bit: bigint) => admin && bit === PermissionFlagsBits.Administrator,
    },
  };
  guild.members.fetch.mockResolvedValue(member);
  const channel = {
    id: CHANNEL,
    guildId: guild.id,
    send: vi.fn(),
    isDMBased: () => false,
  };
  const interaction = {
    user: { id: USER },
    guildId: guild.id,
    guild,
    member,
    channel,
    deferred: false,
    replied: false,
    inCachedGuild: () => true,
    options: {
      getSubcommand: () => sub,
      getString: (key: string) => values[key] ?? null,
      getBoolean: (key: string) => values[key] ?? null,
      getInteger: (key: string) => values[key] ?? null,
      getRole: () => null,
      getChannel: () => null,
      getAttachment: () => ({
        name: "command.md",
        size: 100,
        url: "https://cdn.discordapp.com/attachments/123/456/command.md",
      }),
    },
    deferReply: vi.fn(async () => {
      interaction.deferred = true;
    }),
    editReply: vi.fn(),
    reply: vi.fn(),
    followUp: vi.fn(),
  };
  return interaction;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.ownership.mockResolvedValue(true);
  mocks.list.mockResolvedValue([]);
  mocks.legacyList.mockResolvedValue([]);
  mocks.get.mockResolvedValue(record());
  mocks.find.mockResolvedValue(record());
  mocks.create.mockResolvedValue(record());
  mocks.update.mockResolvedValue(record());
});

test("registration has all management actions, public run, valid option limits and an optional legacy kind", () => {
  command.registerApplicationCommands({
    registerChatInputCommand: (
      build: (builder: SlashCommandBuilder) => void,
    ) => {
      const builder = new SlashCommandBuilder();
      build(builder);
      const data = builder.toJSON();
      expect(data.default_member_permissions).toBeNull();
      expect(data.options!.map((option) => option.name)).toEqual(
        expect.arrayContaining([
          "create",
          "edit",
          "delete",
          "list",
          "info",
          "enable",
          "disable",
          "run",
          "configure",
          "options",
          "clone",
          "rename",
          "import",
          "export",
        ]),
      );
      for (const option of data.options ?? [])
        if ("options" in option)
          expect(option.options!.length).toBeLessThanOrEqual(25);
      const create = data.options!.find((option) => option.name === "create")!;
      if ("options" in create)
        expect(
          create.options!.find((option) => option.name === "kind")!.required,
        ).not.toBe(true);
    },
  } as never);
});
test("options opens sharing settings only for verified administrators", async () => {
  const interaction = fixture("options");
  await command.chatInputRun(interaction as never);
  expect(interaction.deferReply).toHaveBeenCalledWith({
    flags: MessageFlags.Ephemeral,
  });
  expect(mocks.settings).toHaveBeenCalledExactlyOnceWith(interaction);
  mocks.settings.mockClear();
  await command.chatInputRun(fixture("options", {}, false) as never);
  expect(mocks.settings).not.toHaveBeenCalled();
  mocks.ownership.mockResolvedValue(false);
  await command.chatInputRun(fixture("options") as never);
  expect(mocks.settings).not.toHaveBeenCalled();
});

test("slash execution sends the response before its completion acknowledgement", async () => {
  const interaction = fixture("run", { command: "welcome" });
  mocks.execute.mockImplementation(async (_context, transport) => {
    await transport.send({ content: "Hello" }, 0);
    expect(interaction.editReply).not.toHaveBeenCalled();
    expect(interaction.channel.send).toHaveBeenCalledWith({ content: "Hello" });
  });
  mocks.find.mockResolvedValue(record({ replyToInvocation: false }));
  await command.chatInputRun(interaction as never);
  expect(interaction.editReply).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ content: "Executed `welcome`." }),
  );
});
test("ordinary members can run through canonical executor; management is denied server-side", async () => {
  const run = fixture("run", { command: "welcome", args: "John Doe" }, false);
  await command.chatInputRun(run as never);
  expect(mocks.execute).toHaveBeenCalledWith(
    expect.objectContaining({
      guildId: "guild-a",
      userId: USER,
      args: ["John", "Doe"],
      source: "slash",
    }),
    expect.objectContaining({ send: expect.any(Function) }),
  );
  mocks.create.mockClear();
  const create = fixture("create", { name: "new", response: "Hello" }, false);
  await command.chatInputRun(create as never);
  expect(create.reply).toHaveBeenCalledWith(
    expect.objectContaining({
      flags: MessageFlags.Ephemeral,
      content: expect.stringContaining("administrator"),
    }),
  );
  expect(mocks.create).not.toHaveBeenCalled();
});
test("modern creation delegates validated configuration and preserves existing ownership checks", async () => {
  const interaction = fixture("create", {
    name: "welcome",
    response: "Hello {user.name}",
    cooldown: 10,
    aliases: "hi hello",
    active: false,
    delete_invocation: true,
  });
  await command.chatInputRun(interaction as never);
  expect(mocks.create).toHaveBeenCalledWith(
    "guild-a",
    USER,
    expect.objectContaining({
      name: "welcome",
      aliases: ["hi", "hello"],
      enabled: false,
      cooldownSeconds: 10,
      deleteInvocation: true,
      content: [{ type: "TEXT", text: "Hello {user.name}" }],
    }),
  );
  expect(interaction.deferReply).toHaveBeenCalledWith({
    flags: MessageFlags.Ephemeral,
  });
  expect(mocks.ownership).toHaveBeenCalledOnce();
});
test("unverified and direct-message interactions cannot use the domain", async () => {
  mocks.ownership.mockResolvedValue(false);
  const unverified = fixture("run", { command: "welcome" }, false);
  await command.chatInputRun(unverified as never);
  expect(mocks.execute).not.toHaveBeenCalled();
  const dm = fixture("create");
  dm.inCachedGuild = () => false;
  await command.chatInputRun(dm as never);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(dm.reply).toHaveBeenCalledWith(
    expect.objectContaining({ content: "Use this command in a server." }),
  );
});
test("a list offers explicit pagination without truncating commands", async () => {
  mocks.list.mockResolvedValue(
    Array.from({ length: 25 }, (_, i) =>
      record({ id: i, name: `name-${String(i).padStart(2, "0")}` }),
    ),
  );
  const interaction = fixture("list", { page: 2 });
  await showCommandList(interaction as never, []);
  const output = interaction.editReply.mock.calls[0]![0];
  expect(output.content).toContain("name-10");
  expect(output.content).toContain("name-19");
  expect(output.content).not.toContain("name-20");
  expect(output.content).toContain("Page 2/3");
  expect(output.allowedMentions).toEqual({ parse: [] });
});
test("list displays shared commands and each command's individual scope", async () => {
  mocks.list.mockResolvedValue([
    record({ sourceGuildId: "source", sharingScope: "all" }),
    record({ id: 2, name: "specific", sharingScope: "selected" }),
  ]);
  const interaction = fixture("list");
  await showCommandList(interaction as never, []);
  expect(interaction.editReply.mock.calls[0]![0].content).toContain(
    "Global • Shared from source",
  );
  expect(interaction.editReply.mock.calls[0]![0].content).toContain(
    "Specific servers",
  );
});
test("info fields honor Discord limits even with long aliases and permissions", () => {
  const c = record({
    aliases: Array.from({ length: 10 }, (_, i) => `${i}${"x".repeat(99)}`),
    requiredUserPermissions: Array.from(
      { length: 25 },
      () => "SendMessagesInThreads",
    ),
    requiredBotPermissions: Array.from(
      { length: 25 },
      () => "SendMessagesInThreads",
    ),
  });
  const embed = commandInfo(c).toJSON();
  expect(embed.fields!.every((field) => field.value.length <= 1024)).toBe(true);
  expect(new EmbedBuilder(embed).length).toBeLessThanOrEqual(6000);
});
test("editor is separate and embed edits retain the existing response type", async () => {
  const configure = fixture("configure", { name: "welcome" });
  await handleCustomManagement(configure as never);
  expect(mocks.editor).toHaveBeenCalledWith(
    configure,
    expect.objectContaining({ name: "welcome" }),
  );
  mocks.get.mockResolvedValue(
    record({
      responseType: "EMBED",
      content: [{ type: "EMBED", embed: { description: "Old" } }],
    }),
  );
  await handleCustomManagement(
    fixture("edit", { name: "welcome", response: "New" }) as never,
  );
  expect(mocks.update).toHaveBeenCalledWith(
    "guild-a",
    USER,
    "welcome",
    expect.objectContaining({
      responseType: "EMBED",
      content: [{ type: "EMBED", embed: { description: "New" } }],
    }),
  );
});
test("small human-readable permission lists and aliases map into validated domain patches", () => {
  const patch = commandPatch(
    fixture("create", {
      name: "welcome",
      response: "Text",
      user_permissions: "ManageMessages, BanMembers",
      bot_permissions: "EmbedLinks",
      aliases: "none",
    }) as never,
    true,
  );
  expect(patch.requiredUserPermissions).toEqual([
    "ManageMessages",
    "BanMembers",
  ]);
  expect(patch.aliases).toEqual([]);
  expect(definition(patch)).toBeDefined();
});

test("pagination respects rendered message size for long markdown names", async () => {
  mocks.list.mockResolvedValue(
    Array.from({ length: 25 }, (_, i) =>
      record({ id: i, name: `${i}${"_".repeat(99)}` }),
    ),
  );
  const interaction = fixture("list");
  await showCommandList(interaction as never, []);
  expect(
    interaction.editReply.mock.calls[0]![0].content.length,
  ).toBeLessThanOrEqual(2000);
});

test("Markdown file uploads parse and save the definition before opening the editor", async () => {
  const interaction = fixture("markdown", { name: "welcome" });
  const source =
    ":::embed\n@title Uploaded\n@cover https://example.com/cover.png\n@button [Rules](https://example.com/rules)\n:::";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(source)));
  try {
    await command.chatInputRun(interaction as never);
    expect(mocks.update).toHaveBeenCalledWith(
      "guild-a",
      USER,
      "welcome",
      expect.objectContaining({
        responseType: "EMBED",
        content: [
          expect.objectContaining({
            embed: {
              title: "Uploaded",
              image: { url: "https://example.com/cover.png" },
            },
            buttons: [{ label: "Rules", url: "https://example.com/rules" }],
          }),
        ],
      }),
      "updated",
      record().updatedAt,
    );
    expect(mocks.editor).toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

test("ordinary members cannot upload Markdown to change commands", async () => {
  const interaction = fixture("markdown", { name: "welcome" }, false);
  await command.chatInputRun(interaction as never);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(interaction.reply).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining("administrator"),
    }),
  );
});

test("invalid uploaded Markdown never replaces a saved definition", async () => {
  const interaction = fixture("markdown", { name: "welcome" });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(":::embed\n@bad invalid\n:::")),
  );
  try {
    await command.chatInputRun(interaction as never);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Markdown line 2"),
      }),
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
