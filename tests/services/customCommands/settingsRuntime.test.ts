import { beforeEach, expect, test, vi } from "vitest";
import { ComponentType, MessageFlags } from "discord.js";
import { record } from "./fixtures.js";
const mocks = vi.hoisted(() => ({
  manage: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  scope: vi.fn(),
  discover: vi.fn(),
  save: vi.fn(),
  editor: vi.fn(),
}));
vi.mock("../../../src/services/customCommands/runtime.js", () => ({
  customCommandService: {
    invalidate: vi.fn(),
    listCommands: mocks.list,
    getCommand: mocks.get,
  },
  customCommandSharingService: {
    canManage: mocks.manage,
    get: mocks.scope,
    discover: mocks.discover,
    save: mocks.save,
  },
}));
vi.mock("../../../src/services/customCommands/editor.js", () => ({
  openCustomCommandEditor: mocks.editor,
}));
vi.mock("../../../src/logger.js", () => ({ logger: { error: vi.fn() } }));
import { openCustomCommandSettings } from "../../../src/services/customCommands/settings.js";
function fixture() {
  const callbacks: Record<string, (...args: any[]) => any> = {};
  const collector = {
    ended: false,
    resetTimer: vi.fn(),
    on: vi.fn((event, cb) => {
      callbacks[event] = cb;
    }),
    stop: vi.fn((reason) => {
      collector.ended = true;
      callbacks.end([], reason);
    }),
  };
  const message = { createMessageComponentCollector: vi.fn(() => collector) };
  const root = {
    guild: { id: "guild-a" },
    guildId: "guild-a",
    client: {},
    user: { id: "admin" },
    editReply: vi.fn().mockResolvedValue(message),
  };
  const prefix = () => {
    const view = root.editReply.mock.calls[0]![0].components[0].toJSON();
    const row = view.components.find(
      (item: any) => item.type === ComponentType.ActionRow,
    );
    return row.components[0].custom_id.split(":").slice(0, 2).join(":");
  };
  const item = (action: string, values: string[] = [], user = "admin") => ({
    customId: `${prefix()}:${action}`,
    user: { id: user },
    guildId: "guild-a",
    values,
    inCachedGuild: () => true,
    isButton: () => !["scope", "servers", "command"].includes(action),
    isStringSelectMenu: () => ["scope", "servers", "command"].includes(action),
    deferUpdate: vi.fn(),
    deferReply: vi.fn(),
    reply: vi.fn(),
    followUp: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  });
  return { root, callbacks, collector, item };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.manage.mockResolvedValue(true);
  mocks.list.mockResolvedValue([record()]);
  mocks.get.mockResolvedValue(record());
  mocks.scope.mockResolvedValue(null);
  mocks.discover.mockResolvedValue(
    Array.from({ length: 30 }, (_, i) => ({
      id: `server-${i}`,
      name: `Server ${i}`,
    })),
  );
});
test("scope/server dropdowns stage changes, preserve selection across pages, and save explicitly", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  await f.callbacks.collect(f.item("scope", ["selected"]));
  await f.callbacks.collect(f.item("servers", ["server-1"]));
  await f.callbacks.collect(f.item("server-next"));
  await f.callbacks.collect(f.item("servers", ["server-27"]));
  expect(mocks.save).not.toHaveBeenCalled();
  const save = f.item("save");
  mocks.save.mockImplementation(async () => {
    expect(save.deferUpdate).toHaveBeenCalledOnce();
  });
  await f.callbacks.collect(save);
  expect(mocks.save).toHaveBeenCalledWith(
    f.root.client,
    "admin",
    expect.objectContaining({ id: 1 }),
    "selected",
    ["server-1", "server-27"],
  );
});
test("server IDs not offered by the current page cannot be selected", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  await f.callbacks.collect(f.item("scope", ["selected"]));
  const forged = f.item("servers", ["foreign"]);
  await f.callbacks.collect(forged);
  expect(forged.followUp).toHaveBeenCalledWith(
    expect.objectContaining({
      content: "Choose servers from the current page.",
    }),
  );
  expect(mocks.save).not.toHaveBeenCalled();
});
test("another user and revoked administrator access cannot save", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  const other = f.item("save", [], "other");
  await f.callbacks.collect(other);
  expect(other.reply).toHaveBeenCalledOnce();
  expect(other.deferUpdate).not.toHaveBeenCalled();
  mocks.manage.mockResolvedValue(false);
  const revoked = f.item("save");
  await f.callbacks.collect(revoked);
  expect(revoked.followUp).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining("Administrator"),
    }),
  );
  expect(mocks.save).not.toHaveBeenCalled();
});
test("customization opens the existing editor in its own acknowledged reply", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  const button = f.item("customize");
  await f.callbacks.collect(button);
  expect(button.deferReply).toHaveBeenCalledWith({
    flags: MessageFlags.Ephemeral,
  });
  expect(mocks.editor).toHaveBeenCalledWith(
    button,
    expect.objectContaining({ id: 1 }),
  );
  expect(mocks.save).not.toHaveBeenCalled();
});
test("closing discards pending scope changes and disables controls", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  await f.callbacks.collect(f.item("scope", ["all"]));
  await f.callbacks.collect(f.item("close"));
  expect(mocks.save).not.toHaveBeenCalled();
  const view = f.root.editReply.mock.calls.at(-1)![0];
  expect(view.flags).toBe(MessageFlags.IsComponentsV2);
  const controls = view.components[0]
    .toJSON()
    .components.flatMap((item: any) =>
      item.type === ComponentType.ActionRow ? item.components : [],
    );
  expect(controls.every((item: any) => item.disabled)).toBe(true);
});
test("an unverified server is denied before command discovery", async () => {
  mocks.manage.mockResolvedValue(false);
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  expect(mocks.list).not.toHaveBeenCalled();
  expect(f.root.editReply).toHaveBeenCalledWith({
    content: expect.stringContaining("verified server ownership"),
  });
});

test("changing commands and refreshing discard only pending scope selections", async () => {
  const first = record(),
    second = record({ id: 2, name: "other-command" });
  mocks.list.mockResolvedValue([first, second]);
  mocks.scope.mockImplementation(async (command) =>
    command.id === second.id
      ? { scope: "selected", selectedGuildIds: "server-2" }
      : null,
  );
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  await f.callbacks.collect(f.item("scope", ["all"]));
  await f.callbacks.collect(f.item("command", [String(second.id)]));
  await f.callbacks.collect(f.item("servers", ["server-3"]));
  await f.callbacks.collect(f.item("refresh"));
  expect(mocks.save).not.toHaveBeenCalled();
  await f.callbacks.collect(f.item("save"));
  expect(mocks.save).toHaveBeenCalledWith(
    f.root.client,
    "admin",
    second,
    "selected",
    ["server-2"],
  );
});

test("overlapping saves are rejected and an in-flight save never revives an expired session", async () => {
  let release!: () => void;
  mocks.save.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  const saving = f.callbacks.collect(f.item("save"));
  await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  const overlapping = f.item("save");
  await f.callbacks.collect(overlapping);
  expect(overlapping.reply).toHaveBeenCalledWith(
    expect.objectContaining({
      content: "Finish the current action or reopen Settings.",
    }),
  );
  f.collector.ended = true;
  f.callbacks.end([], "time");
  const replyCountAtExpiry = f.root.editReply.mock.calls.length;
  release();
  await saving;
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(f.root.editReply).toHaveBeenCalledTimes(replyCountAtExpiry);
  const view = f.root.editReply.mock.calls.at(-1)![0].components[0].toJSON();
  expect(
    view.components.some(
      (item: any) =>
        item.type === ComponentType.TextDisplay &&
        item.content.includes("expired"),
    ),
  ).toBe(true);
});

test("a failed save reports the failure and leaves the session usable for retry", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  mocks.save.mockRejectedValueOnce(new Error("database unavailable"));
  const failed = f.item("save");
  await f.callbacks.collect(failed);
  expect(failed.followUp).toHaveBeenCalledWith(
    expect.objectContaining({
      content: "Could not load or save custom command settings. Try again.",
    }),
  );
  expect(f.collector.ended).toBe(false);
  mocks.save.mockResolvedValueOnce(undefined);
  await f.callbacks.collect(f.item("save"));
  expect(mocks.save).toHaveBeenCalledTimes(2);
  expect(
    f.root.editReply.mock.calls
      .at(-1)![0]
      .components[0].toJSON()
      .components.some(
        (item: any) =>
          item.type === ComponentType.TextDisplay &&
          item.content.includes("scope saved"),
      ),
  ).toBe(true);
});
