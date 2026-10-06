import { beforeEach, expect, test, vi } from "vitest";
import { MessageFlags } from "discord.js";
const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  ownership: vi.fn(),
  shared: vi.fn(),
}));
vi.mock("../../../src/services/customCommands/runtime.js", () => ({
  customCommandService: { updateCommand: mocks.update },
  customCommandSharingService: { forManagement: mocks.shared },
}));
vi.mock("../../../src/services/guildOwnershipService.js", () => ({
  requireVerifiedOwnership: mocks.ownership,
}));
vi.mock("../../../src/logger.js", () => ({ logger: { error: vi.fn() } }));
import { openCustomCommandEditor } from "../../../src/services/customCommands/editor.js";
import { record, USER } from "./fixtures.js";
function fixture() {
  let collect!: (interaction: unknown) => Promise<void>;
  const collector = {
    ended: false,
    on: (event: string, listener: (interaction: unknown) => Promise<void>) => {
      if (event === "collect") collect = listener;
    },
  };
  const guild = {
    id: "guild-a",
    ownerId: USER,
    members: {
      fetch: vi
        .fn()
        .mockResolvedValue({ id: USER, permissions: { has: () => true } }),
    },
  };
  const root = {
    user: { id: USER },
    guildId: guild.id,
    guild,
    editReply: vi
      .fn()
      .mockResolvedValue({ createMessageComponentCollector: () => collector }),
  };
  const button = {
    user: { id: USER },
    guildId: guild.id,
    guild,
    customId: "cc:session:response",
    inCachedGuild: () => true,
    isButton: () => true,
    showModal: vi.fn(),
    awaitModalSubmit: vi.fn(),
    reply: vi.fn(),
    followUp: vi.fn(),
    deferUpdate: vi.fn(),
  };
  return {
    collector,
    root,
    guild,
    button,
    collect: (interaction: unknown) => collect(interaction),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.ownership.mockResolvedValue(true);
  mocks.update.mockResolvedValue(record());
});
test("editing a shared command writes to its original server and preserves shared identity", async () => {
  const f = fixture();
  const original = record({ guildId: "source" });
  mocks.shared.mockResolvedValue(original);
  mocks.update.mockResolvedValue(original);
  const saved = vi.fn();
  await openCustomCommandEditor(
    f.root as never,
    record({ sourceGuildId: "source" }),
    saved,
  );
  f.button.customId = "cc:session:add-text";
  await f.collect(f.button);
  expect(mocks.shared).toHaveBeenCalledOnce();
  expect(mocks.update).toHaveBeenCalledWith(
    "source",
    USER,
    original.name,
    expect.any(Object),
    "updated",
    original.updatedAt,
  );
  expect(saved).toHaveBeenCalledWith(
    expect.objectContaining({ guildId: "guild-a", sourceGuildId: "source" }),
  );
  mocks.update.mockClear();
  f.button.followUp.mockResolvedValue(undefined);
  mocks.shared.mockRejectedValue(new Error("Sharing revoked"));
  await f.collect(f.button);
  expect(mocks.update).not.toHaveBeenCalled();
});
test("foreign users cannot use an editor and current permissions are rechecked on saves", async () => {
  const f = fixture();
  await openCustomCommandEditor(f.root as never, record());
  f.button.user.id = "other";
  await f.collect(f.button);
  expect(f.button.reply).toHaveBeenCalledWith(
    expect.objectContaining({ flags: MessageFlags.Ephemeral }),
  );
  expect(mocks.update).not.toHaveBeenCalled();
  f.button.user.id = USER;
  f.guild.ownerId = "other";
  f.guild.members.fetch.mockResolvedValue({
    id: USER,
    permissions: { has: () => false },
  });
  f.button.customId = "cc:session:clear";
  await f.collect(f.button);
  expect(f.guild.members.fetch).toHaveBeenCalledWith({
    user: USER,
    force: true,
  });
  expect(mocks.update).not.toHaveBeenCalled();
});
test("unverified guilds cannot save component changes", async () => {
  const f = fixture();
  await openCustomCommandEditor(f.root as never, record());
  f.button.customId = "cc:session:clear";
  mocks.ownership.mockResolvedValue(false);
  await f.collect(f.button);
  expect(mocks.ownership).toHaveBeenCalledOnce();
  expect(mocks.update).not.toHaveBeenCalled();
});
test("a modal validation error completes the modal reply without writing", async () => {
  const f = fixture();
  await openCustomCommandEditor(f.root as never, record());
  f.button.customId = "cc:session:settings";
  const submission = {
    user: { id: USER },
    guildId: f.guild.id,
    guild: f.guild,
    inCachedGuild: () => true,
    deferReply: vi.fn(),
    editReply: vi.fn().mockResolvedValue(undefined),
    fields: {
      getTextInputValue: (key: string) => (key === "flags" ? "bad" : ""),
    },
  };
  f.button.awaitModalSubmit.mockResolvedValue(submission);
  await f.collect(f.button);
  expect(submission.deferReply).toHaveBeenCalledWith({
    flags: MessageFlags.Ephemeral,
  });
  expect(submission.editReply).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining("Flags may contain"),
    }),
  );
  expect(mocks.update).not.toHaveBeenCalled();
});
test("modal saves use the observed revision and never revive expired controls", async () => {
  const f = fixture();
  const command = record();
  const onSaved = vi.fn();
  await openCustomCommandEditor(f.root as never, command, onSaved);
  const submission = {
    user: { id: USER },
    guildId: f.guild.id,
    guild: f.guild,
    inCachedGuild: () => true,
    deferReply: vi.fn(),
    editReply: vi.fn().mockResolvedValue(undefined),
    fields: { getTextInputValue: () => "New response" },
  };
  f.button.awaitModalSubmit.mockImplementation(async () => {
    f.collector.ended = true;
    return submission;
  });
  await f.collect(f.button);
  expect(mocks.update).toHaveBeenCalledWith(
    f.guild.id,
    USER,
    command.name,
    expect.objectContaining({
      content: [{ type: "TEXT", text: "New response" }],
    }),
    "updated",
    command.updatedAt,
  );
  expect(onSaved).toHaveBeenCalledWith(record());
  expect(f.root.editReply).toHaveBeenLastCalledWith(
    expect.objectContaining({ components: [] }),
  );
});

test("component saves notify settings with the updated command", async () => {
  const f = fixture();
  const onSaved = vi.fn();
  await openCustomCommandEditor(f.root as never, record(), onSaved);
  f.button.customId = "cc:session:clear";
  await f.collect(f.button);
  expect(mocks.update).toHaveBeenCalledOnce();
  expect(onSaved).toHaveBeenCalledWith(record());
});

test("preview renders sample arguments privately without saving", async () => {
  const f = fixture();
  Object.assign(f.root, { channel: { id: "channel", isDMBased: () => false } });
  await openCustomCommandEditor(
    f.root as never,
    record({ content: [{ type: "TEXT", text: "Hello {args.first}" }] }),
  );
  f.button.customId = "cc:session:preview";
  const submission = {
    user: { id: USER },
    guildId: f.guild.id,
    guild: f.guild,
    inCachedGuild: () => true,
    deferReply: vi.fn(),
    editReply: vi.fn(),
    followUp: vi.fn(),
    fields: { getTextInputValue: () => "Alex" },
  };
  f.button.awaitModalSubmit.mockResolvedValue(submission);
  await f.collect(f.button);
  expect(submission.followUp).toHaveBeenCalledWith(
    expect.objectContaining({
      content: "Hello Alex",
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    }),
  );
  expect(mocks.update).not.toHaveBeenCalled();
});

test("variable help lists placeholders without saving", async () => {
  const f = fixture();
  await openCustomCommandEditor(f.root as never, record());
  f.button.customId = "cc:session:variables";
  await f.collect(f.button);
  expect(f.button.followUp).toHaveBeenCalledWith(
    expect.objectContaining({
      flags: MessageFlags.Ephemeral,
      embeds: [expect.objectContaining({ title: "Command variables" })],
    }),
  );
  expect(mocks.update).not.toHaveBeenCalled();
});

test("template downloads and syntax examples use .txt with a Rules page", async () => {
  const f = fixture();
  await openCustomCommandEditor(f.root as never, record());
  f.button.customId = "cc:session:markdown-help";
  await f.collect(f.button);
  const help = f.button.followUp.mock.calls[0]![0];
  expect(help.content).toContain("Rules page");
  expect(help.files[0].name).toBe("command-example.txt");
  f.button.followUp.mockClear();
  f.button.customId = "cc:session:markdown-download";
  await f.collect(f.button);
  expect(f.button.followUp.mock.calls[0]![0].files[0].name).toBe("command.txt");
});

test("Markdown modal saves parsed responses with the observed revision", async () => {
  const f = fixture();
  const initial = record();
  await openCustomCommandEditor(f.root as never, initial);
  f.button.customId = "cc:session:markdown";
  const submission = {
    user: { id: USER },
    guildId: f.guild.id,
    guild: f.guild,
    inCachedGuild: () => true,
    deferReply: vi.fn(),
    editReply: vi.fn(),
    fields: {
      getTextInputValue: () =>
        ":::embed\n@title New title\n@cover https://example.com/cover.png\n@button [Rules](https://example.com/rules)\n:::",
    },
  };
  f.button.awaitModalSubmit.mockResolvedValue(submission);
  await f.collect(f.button);
  expect(mocks.update).toHaveBeenCalledWith(
    f.guild.id,
    USER,
    initial.name,
    expect.objectContaining({
      responseType: "EMBED",
      content: [
        expect.objectContaining({
          type: "EMBED",
          embed: {
            title: "New title",
            image: { url: "https://example.com/cover.png" },
          },
          buttons: [{ label: "Rules", url: "https://example.com/rules" }],
        }),
      ],
    }),
    "updated",
    initial.updatedAt,
  );
});

test("invalid Markdown reports an error without replacing the saved responses", async () => {
  const f = fixture();
  await openCustomCommandEditor(f.root as never, record());
  f.button.customId = "cc:session:markdown";
  const submission = {
    user: { id: USER },
    guildId: f.guild.id,
    guild: f.guild,
    inCachedGuild: () => true,
    deferReply: vi.fn(),
    editReply: vi.fn().mockResolvedValue(undefined),
    fields: { getTextInputValue: () => ":::embed\n@bad directive\n:::" },
  };
  f.button.awaitModalSubmit.mockResolvedValue(submission);
  await f.collect(f.button);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(submission.editReply).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining("Markdown line 2"),
    }),
  );
});

test("large templates are never truncated into the modal", async () => {
  const f = fixture();
  await openCustomCommandEditor(
    f.root as never,
    record({
      content: [{ type: "EMBED", embed: { description: "x".repeat(4096) } }],
    }),
  );
  f.button.customId = "cc:session:markdown";
  await f.collect(f.button);
  expect(f.button.showModal).not.toHaveBeenCalled();
  expect(f.button.reply).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining("Download .txt"),
    }),
  );
  expect(mocks.update).not.toHaveBeenCalled();
});
