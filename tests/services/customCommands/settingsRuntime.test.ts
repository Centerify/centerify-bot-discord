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
    listAvailable: mocks.list,
    forManagement: mocks.get,
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
import { CustomCommandSharingConflictError } from "../../../src/services/customCommands/CustomCommandSharingService.js";
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
  const warnings: any[] = [];
  const warningCallbacks: Record<string, (...args: any[]) => any> = {};
  const warningEdit = vi.fn().mockResolvedValue(undefined);
  const warningCollector = {
    on: vi.fn((event, callback) => {
      warningCallbacks[event] = callback;
    }),
    stop: vi.fn((reason) => warningCallbacks.end?.([], reason)),
  };
  const followUp = async (payload: any) => {
    if (payload.embeds) warnings.push(payload);
    return {
      id: "warning-message",
      createMessageComponentCollector: vi.fn(() => warningCollector),
    };
  };
  const item = (action: string, values: string[] = [], user = "admin") => ({
    customId: `${prefix()}:${action}`,
    webhook: {
      editMessage: (_id: string, payload: unknown) => warningEdit(payload),
    },
    user: { id: user },
    guildId: "guild-a",
    values,
    inCachedGuild: () => true,
    isButton: () => !["scope", "servers", "command", "customize-command"].includes(action),
    isStringSelectMenu: () => ["scope", "servers", "command", "customize-command"].includes(action),
    deferUpdate: vi.fn(),
    deferReply: vi.fn(),
    reply: vi.fn(),
    followUp: vi.fn(followUp),
    editReply: vi.fn().mockResolvedValue(undefined),
  });
  return {
    root,
    callbacks,
    collector,
    item,
    warnings,
    warningCallbacks,
    warningEdit,
  };
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
test("customizing another command keeps a batch selected, then its scope can be changed individually", async () => {
  const rows = [record(), record({ id: 2, name: "second" }), record({ id: 3, name: "third" })];
  mocks.list.mockResolvedValue(rows);
  mocks.get.mockResolvedValue(rows[2]);
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  await f.callbacks.collect(f.item("command", ["1", "2"]));
  await f.callbacks.collect(f.item("scope", ["all"]));
  await f.callbacks.collect(f.item("customize-command", ["3"]));
  await f.callbacks.collect(f.item("customize"));
  expect(mocks.editor).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 3 }), expect.any(Function));
  expect(rendered(f).text).toContain("Commands selected:** 2");
  await f.callbacks.collect(f.item("save"));
  expect(mocks.save.mock.calls.map((args) => [args[2].id, args[3]])).toEqual([[1, "all"], [2, "all"]]);
  mocks.save.mockClear();
  await f.callbacks.collect(f.item("only-command"));
  await f.callbacks.collect(f.item("scope", ["selected"]));
  await f.callbacks.collect(f.item("servers", ["server-2"]));
  await f.callbacks.collect(f.item("save"));
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(f.root.client, "admin", expect.objectContaining({ id: 3 }), "selected", ["server-2"]);
});

test("customization rejects command IDs outside the visible page", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  const item = f.item("customize-command", ["999"]);
  await f.callbacks.collect(item);
  expect(item.followUp).toHaveBeenCalledWith(expect.objectContaining({ content: "Choose one command from this page." }));
  expect(mocks.editor).not.toHaveBeenCalled();
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
    expect.any(Function),
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

test("changing commands and refreshing preserve pending scope selections", async () => {
  const first = record(),
    second = record({ id: 2, name: "z-other-command" });
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
    ["server-3"],
  );
  await f.callbacks.collect(f.item("command", [String(first.id)]));
  expect(rendered(f).text).toContain("All eligible servers");
});

test("Save waits for a preceding scope change and panel update", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  let release!: () => void;
  f.root.editReply.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const changing = f.callbacks.collect(f.item("scope", ["all"]));
  await vi.waitFor(() => expect(f.root.editReply).toHaveBeenCalledTimes(2));
  const save = f.item("save");
  const saving = f.callbacks.collect(save);
  await vi.waitFor(() => expect(save.deferUpdate).toHaveBeenCalledOnce());
  expect(save.reply).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
  release();
  await Promise.all([changing, saving]);
  expect(mocks.save).toHaveBeenCalledWith(
    f.root.client,
    "admin",
    expect.objectContaining({ id: 1 }),
    "all",
    [],
  );
});

test("queued server selections and Save run after server discovery in click order", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  let release!: () => void;
  mocks.discover.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve([{ id: "server-1", name: "Server 1" }]);
      }),
  );
  const changing = f.callbacks.collect(f.item("scope", ["selected"]));
  await vi.waitFor(() => expect(mocks.discover).toHaveBeenCalledOnce());
  const servers = f.item("servers", ["server-1"]);
  const selecting = f.callbacks.collect(servers);
  const save = f.item("save");
  const saving = f.callbacks.collect(save);
  await vi.waitFor(() => {
    expect(servers.deferUpdate).toHaveBeenCalledOnce();
    expect(save.deferUpdate).toHaveBeenCalledOnce();
  });
  expect(mocks.save).not.toHaveBeenCalled();
  release();
  await Promise.all([changing, selecting, saving]);
  expect(servers.reply).not.toHaveBeenCalled();
  expect(save.reply).not.toHaveBeenCalled();
  expect(mocks.save).toHaveBeenCalledWith(
    f.root.client,
    "admin",
    expect.objectContaining({ id: 1 }),
    "selected",
    ["server-1"],
  );
});

test("an expired session discards queued saves and an in-flight save never revives it", async () => {
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
  const queued = f.callbacks.collect(overlapping);
  await vi.waitFor(() =>
    expect(overlapping.deferUpdate).toHaveBeenCalledOnce(),
  );
  f.collector.ended = true;
  f.callbacks.end([], "time");
  const replyCountAtExpiry = f.root.editReply.mock.calls.length;
  release();
  await Promise.all([saving, queued]);
  expect(overlapping.followUp).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining("Reopen /settings"),
    }),
  );
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

test("overlapping saves run one at a time and a failure releases the next action", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  let fail!: () => void;
  mocks.save.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        fail = () => reject(new Error("database unavailable"));
      }),
  );
  const first = f.item("save");
  const saving = f.callbacks.collect(first);
  await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  const next = f.item("save");
  const queued = f.callbacks.collect(next);
  await vi.waitFor(() => expect(next.deferUpdate).toHaveBeenCalledOnce());
  expect(mocks.save).toHaveBeenCalledOnce();
  fail();
  await Promise.all([saving, queued]);
  expect(first.followUp).toHaveBeenCalledOnce();
  expect(next.reply).not.toHaveBeenCalled();
  expect(next.followUp).not.toHaveBeenCalled();
  expect(mocks.save).toHaveBeenCalledTimes(2);
});

test("queued saves recheck administrator access before writing", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  let release!: () => void;
  f.root.editReply.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const changing = f.callbacks.collect(f.item("scope", ["all"]));
  await vi.waitFor(() => expect(f.root.editReply).toHaveBeenCalledTimes(2));
  const save = f.item("save");
  const saving = f.callbacks.collect(save);
  await vi.waitFor(() => expect(save.deferUpdate).toHaveBeenCalledOnce());
  mocks.manage.mockResolvedValue(false);
  release();
  await Promise.all([changing, saving]);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(save.followUp).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining("Administrator"),
    }),
  );
});

test("expiration during a queued save's access check prevents the write", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  let release!: () => void;
  mocks.manage.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        release = () => resolve(true);
      }),
  );
  const save = f.item("save");
  const saving = f.callbacks.collect(save);
  await vi.waitFor(() => expect(mocks.manage).toHaveBeenCalledTimes(2));
  f.collector.ended = true;
  f.callbacks.end([], "time");
  release();
  await saving;
  expect(mocks.save).not.toHaveBeenCalled();
  expect(save.followUp).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining("Reopen /settings"),
    }),
  );
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

function rendered(f: ReturnType<typeof fixture>) {
  const container = f.root.editReply.mock.calls
    .at(-1)![0]
    .components[0].toJSON();
  return {
    text: container.components
      .filter((item: any) => item.type === ComponentType.TextDisplay)
      .map((item: any) => item.content)
      .join("\n"),
    controls: container.components.flatMap((item: any) =>
      item.type === ComponentType.ActionRow ? item.components : [],
    ),
  };
}
function duplicate(fingerprint = "confirmation") {
  return new CustomCommandSharingConflictError(
    [{ guildId: "server-1", guildName: "Server 1", names: ["welcome"] }],
    fingerprint,
  );
}
function warningRendered(f: ReturnType<typeof fixture>) {
  const payload = f.warnings.at(-1);
  return {
    text: payload.embeds
      .map((embed: any) => {
        const data = embed.toJSON();
        return `${data.title}\n${data.description}`;
      })
      .join("\n"),
    controls: payload.components.flatMap((row: any) => row.toJSON().components),
  };
}
async function warned() {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  await f.callbacks.collect(f.item("scope", ["selected"]));
  await f.callbacks.collect(f.item("servers", ["server-1"]));
  mocks.save.mockRejectedValueOnce(duplicate());
  const save = f.item("save");
  await f.callbacks.collect(save);
  const proceed = warningRendered(f)
    .controls.find((control: any) => control.label === "Keep Existing")
    .custom_id.split(":")
    .at(-1);
  return { ...f, proceed, save };
}

test("selecting servers updates the panel, and returning to Specific servers resets pagination", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  await f.callbacks.collect(f.item("scope", ["selected"]));
  expect(rendered(f).text).toContain("Selected servers");
  await f.callbacks.collect(f.item("servers", ["server-1", "server-2"]));
  expect(rendered(f).text).toContain("Selected:** 2 other servers");
  expect(
    rendered(f)
      .controls.find((control: any) => control.custom_id.endsWith(":servers"))
      .options.filter((option: any) => option.default)
      .map((option: any) => option.value),
  ).toEqual(["server-1", "server-2"]);
  await f.callbacks.collect(f.item("server-next"));
  await f.callbacks.collect(f.item("scope", ["all"]));
  mocks.discover.mockResolvedValue([{ id: "server-1", name: "Server 1" }]);
  await f.callbacks.collect(f.item("scope", ["selected"]));
  expect(
    rendered(f).controls.find((control: any) =>
      control.custom_id.endsWith(":servers"),
    ).options[0].value,
  ).toBe("server-1");
  expect(mocks.save).not.toHaveBeenCalled();
});

test("duplicate warning requires an explicit Proceed click and consumes that confirmation", async () => {
  const f = await warned();
  expect(warningRendered(f).text).toContain("Duplicate commands found");
  expect(warningRendered(f).text).toContain("Server 1");
  expect(f.save.followUp).toHaveBeenCalledWith(
    expect.objectContaining({ flags: MessageFlags.Ephemeral }),
  );
  expect(mocks.save).toHaveBeenCalledTimes(1);
  await f.warningCallbacks.collect(f.item(f.proceed));
  expect(mocks.save).toHaveBeenLastCalledWith(
    f.root.client,
    "admin",
    expect.objectContaining({ id: 1 }),
    "selected",
    ["server-1"],
    "confirmation",
  );
  expect(rendered(f).text).toContain("scope saved");
  expect(
    rendered(f).controls.some((control: any) => control.label === "Keep Existing"),
  ).toBe(false);
  const replay = f.item(f.proceed);
  await f.callbacks.collect(replay);
  expect(mocks.save).toHaveBeenCalledTimes(2);
  expect(replay.followUp).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining("no longer valid"),
    }),
  );
});

test.each([
  "cancel",
  "scope",
  "servers",
  "clear",
  "refresh",
  "command",
  "customize",
])("%s invalidates the pending duplicate confirmation", async (action) => {
  const f = await warned();
  const values =
    action === "scope"
      ? ["all"]
      : action === "servers"
        ? ["server-2"]
        : action === "command"
          ? ["1"]
          : [];
  await f.callbacks.collect(f.item(action, values));
  const stale = f.item(f.proceed);
  await f.callbacks.collect(stale);
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(stale.followUp).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining("no longer valid"),
    }),
  );
});

test("new duplicates on Proceed require a fresh warning and confirmation", async () => {
  const f = await warned();
  mocks.save.mockRejectedValueOnce(duplicate("changed-conflicts"));
  await f.callbacks.collect(f.item(f.proceed));
  const next = warningRendered(f)
    .controls.find((control: any) => control.label === "Keep Existing")
    .custom_id.split(":")
    .at(-1);
  expect(next).not.toBe(f.proceed);
  await f.callbacks.collect(f.item(f.proceed));
  expect(mocks.save).toHaveBeenCalledTimes(2);
  await f.callbacks.collect(f.item(next));
  expect(mocks.save).toHaveBeenLastCalledWith(
    f.root.client,
    "admin",
    expect.objectContaining({ id: 1 }),
    "selected",
    ["server-1"],
    "changed-conflicts",
  );
});

test("forged Proceed without a warning cannot save", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  const forged = f.item("proceed-undefined");
  await f.callbacks.collect(forged);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(forged.followUp).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining("no longer valid"),
    }),
  );
});

test.each([
  "other user",
  "foreign guild",
  "uncached guild",
  "revoked access",
  "expired",
])("Proceed denies %s", async (denial) => {
  const f = await warned();
  const item = f.item(
    f.proceed,
    [],
    denial === "other user" ? "other" : "admin",
  );
  if (denial === "foreign guild") item.guildId = "foreign";
  if (denial === "uncached guild") item.inCachedGuild = () => false;
  if (denial === "revoked access") mocks.manage.mockResolvedValue(false);
  if (denial === "expired") {
    f.collector.ended = true;
    f.callbacks.end([], "time");
  }
  await f.callbacks.collect(item);
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(item.reply.mock.calls.length + item.followUp.mock.calls.length).toBe(
    1,
  );
});

test("server selection is rejected when Specific servers is not active", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  await f.callbacks.collect(f.item("scope", ["selected"]));
  await f.callbacks.collect(f.item("scope", ["all"]));
  const stale = f.item("servers", ["server-1"]);
  await f.callbacks.collect(stale);
  expect(stale.followUp).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining("Specific servers"),
    }),
  );
});

test("a warning display failure leaves saving blocked and reports a retryable error", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  mocks.save.mockRejectedValueOnce(duplicate());
  const save = f.item("save");
  save.followUp.mockRejectedValueOnce(new Error("Discord unavailable"));
  await f.callbacks.collect(save);
  expect(save.followUp).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining(
        "Could not display the duplicate warning",
      ),
    }),
  );
  expect(f.collector.ended).toBe(false);
  await f.callbacks.collect(f.item("proceed-undefined"));
  expect(mocks.save).toHaveBeenCalledOnce();
});

test("multi-command selection saves the displayed scope for every selected command", async () => {
  const second = record({ id: 2, name: "second" });
  mocks.list.mockResolvedValue([record(), second]);
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  await f.callbacks.collect(f.item("command", ["1", "2"]));
  expect(rendered(f).text).toContain("Commands selected:** 2");
  expect(
    rendered(f).controls.find((c: any) => c.label === "Customize").disabled,
  ).toBe(false);
  await f.callbacks.collect(f.item("scope", ["selected"]));
  await f.callbacks.collect(f.item("servers", ["server-1", "server-2"]));
  await f.callbacks.collect(f.item("refresh"));
  await f.callbacks.collect(f.item("save"));
  expect(mocks.save).toHaveBeenCalledTimes(2);
  for (const command of [record(), second])
    expect(mocks.save).toHaveBeenCalledWith(
      f.root.client,
      "admin",
      command,
      "selected",
      ["server-1", "server-2"],
    );
  expect(rendered(f).text).toContain("2 command scopes saved");
  expect(rendered(f).text).not.toContain("Unsaved scope changes");
});

test("refresh preserves a Specific servers draft over a saved All servers scope", async () => {
  mocks.scope.mockResolvedValue({ scope: "all", selectedGuildIds: "" });
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  await f.callbacks.collect(f.item("scope", ["selected"]));
  await f.callbacks.collect(f.item("servers", ["server-1"]));
  await f.callbacks.collect(f.item("refresh"));
  expect(rendered(f).text).toContain("Selected servers");
  expect(rendered(f).text).toContain("Unsaved scope changes");
  await f.callbacks.collect(f.item("save"));
  expect(mocks.save).toHaveBeenLastCalledWith(
    f.root.client,
    "admin",
    expect.anything(),
    "selected",
    ["server-1"],
  );
});

test("save reloads the command version while keeping the scope draft", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  await f.callbacks.collect(f.item("scope", ["all"]));
  const updated = record({ updatedAt: "later", name: "renamed" });
  mocks.list.mockResolvedValue([updated]);
  await f.callbacks.collect(f.item("save"));
  expect(mocks.save).toHaveBeenLastCalledWith(
    f.root.client,
    "admin",
    updated,
    "all",
    [],
  );
});

test("customize updates the parent panel without resetting the scope draft", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  await f.callbacks.collect(f.item("scope", ["selected"]));
  await f.callbacks.collect(f.item("servers", ["server-1"]));
  await f.callbacks.collect(f.item("customize"));
  const updated = record({ name: "renamed", enabled: false });
  await mocks.editor.mock.calls[0]![2](updated);
  expect(rendered(f).text).toContain("renamed");
  expect(rendered(f).text).toContain("Disabled");
  expect(rendered(f).text).toContain("Selected:** 1 other servers");
});

test("batch duplicate confirmation resumes at the conflicting command", async () => {
  mocks.list.mockResolvedValue([record(), record({ id: 2, name: "second" })]);
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  await f.callbacks.collect(f.item("command", ["1", "2"]));
  await f.callbacks.collect(f.item("scope", ["all"]));
  mocks.save
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(duplicate());
  await f.callbacks.collect(f.item("save"));
  expect(warningRendered(f).text).toContain("1 command(s) saved");
  const proceed = warningRendered(f)
    .controls.find((c: any) => c.label === "Keep Existing")
    .custom_id.split(":")
    .at(-1);
  await f.callbacks.collect(f.item(proceed));
  expect(mocks.save).toHaveBeenCalledTimes(3);
  expect(mocks.save).toHaveBeenLastCalledWith(
    f.root.client,
    "admin",
    expect.objectContaining({ id: 2 }),
    "all",
    [],
    "confirmation",
  );
  expect(rendered(f).text).toContain("2 command scopes saved");
});

test("batch failures report partial progress and leave remaining drafts intact", async () => {
  mocks.list.mockResolvedValue([record(), record({ id: 2, name: "second" })]);
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  await f.callbacks.collect(f.item("command", ["1", "2"]));
  await f.callbacks.collect(f.item("scope", ["all"]));
  mocks.save
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("failed"));
  await f.callbacks.collect(f.item("save"));
  expect(rendered(f).text).toContain(
    "1 command(s) saved; 1 command(s) were not saved",
  );
  await f.callbacks.collect(f.item("command", ["2"]));
  expect(rendered(f).text).toContain("All eligible servers");
  expect(rendered(f).text).toContain("Unsaved scope changes");
});

test("command selections persist across pages, including clearing a page", async () => {
  mocks.list.mockResolvedValue(
    Array.from({ length: 30 }, (_, i) =>
      record({ id: i + 1, name: `cmd${String(i).padStart(2, "0")}` }),
    ),
  );
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  await f.callbacks.collect(f.item("command", ["1", "2"]));
  await f.callbacks.collect(f.item("command-next"));
  await f.callbacks.collect(f.item("command", ["26"]));
  expect(rendered(f).text).toContain("Commands selected:** 3");
  await f.callbacks.collect(f.item("command-previous"));
  await f.callbacks.collect(f.item("command", []));
  expect(rendered(f).text).toContain("Commands selected:** 1");
  await f.callbacks.collect(f.item("scope", ["all"]));
  await f.callbacks.collect(f.item("save"));
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(mocks.save.mock.calls[0]![2].id).toBe(26);
});

test("failed server discovery keeps the displayed and stored scope consistent", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  mocks.discover.mockRejectedValueOnce(new Error("unavailable"));
  await f.callbacks.collect(f.item("scope", ["selected"]));
  await f.callbacks.collect(f.item("save"));
  expect(mocks.save).toHaveBeenLastCalledWith(
    f.root.client,
    "admin",
    expect.anything(),
    "server",
    [],
  );
});

test("clearing the sharing selection keeps customization available", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  await f.callbacks.collect(f.item("command", []));
  for (const label of ["Save Scope"])
    expect(
      rendered(f).controls.find((c: any) => c.label === label).disabled,
    ).toBe(true);
  await f.callbacks.collect(f.item("save"));
  expect(mocks.save).not.toHaveBeenCalled();
});

test("a failed command switch cannot save the previous scope to a different command", async () => {
  mocks.list.mockResolvedValue([record(), record({ id: 2, name: "z-second" })]);
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  await f.callbacks.collect(f.item("scope", ["all"]));
  mocks.scope.mockRejectedValueOnce(new Error("unavailable"));
  await f.callbacks.collect(f.item("command", ["2"]));
  await f.callbacks.collect(f.item("save"));
  expect(mocks.save).toHaveBeenLastCalledWith(
    f.root.client,
    "admin",
    expect.objectContaining({ id: 1 }),
    "all",
    [],
  );
});

test("refresh removes deleted commands and never silently selects a replacement", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  mocks.list.mockResolvedValue([record({ id: 2, name: "replacement" })]);
  await f.callbacks.collect(f.item("refresh"));
  expect(
    rendered(f).controls.find((c: any) => c.label === "Save Scope").disabled,
  ).toBe(true);
  await f.callbacks.collect(f.item("save"));
  expect(mocks.save).not.toHaveBeenCalled();
});

test("expired dropdown acknowledgements preserve drafts and recover using the original reply", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  await f.callbacks.collect(f.item("scope", ["selected"]));
  await f.callbacks.collect(f.item("servers", ["server-1"]));
  const expired = f.item("servers", ["server-2"]);
  expired.deferUpdate.mockRejectedValueOnce(
    Object.assign(new Error("Unknown interaction"), { code: 10062 }),
  );
  await f.callbacks.collect(expired);
  expect(expired.followUp).not.toHaveBeenCalled();
  expect(expired.editReply).not.toHaveBeenCalled();
  expect(rendered(f).text).toContain("It was not applied");
  expect(
    rendered(f).controls.find((c: any) => c.label === "Save Scope").disabled,
  ).toBe(true);
  const servers = rendered(f).controls.find((c: any) =>
    c.custom_id.endsWith(":servers"),
  );
  expect(
    servers.options.filter((o: any) => o.default).map((o: any) => o.value),
  ).toEqual(["server-1"]);
  const save = f.item("save");
  await f.callbacks.collect(save);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(save.followUp).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining("Retry your selection"),
    }),
  );
  await f.callbacks.collect(f.item("servers", ["server-2"]));
  await f.callbacks.collect(f.item("save"));
  expect(mocks.save).toHaveBeenLastCalledWith(
    f.root.client,
    "admin",
    expect.anything(),
    "selected",
    ["server-2"],
  );
});

test("a queued Save cannot overtake a failed acknowledgement or write stale inputs", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  let reject!: (error: unknown) => void;
  const expired = f.item("scope", ["all"]);
  expired.deferUpdate.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  const changing = f.callbacks.collect(expired);
  const save = f.item("save");
  const saving = f.callbacks.collect(save);
  expect(save.deferUpdate).toHaveBeenCalledOnce();
  reject(Object.assign(new Error("Unknown interaction"), { code: 10062 }));
  await Promise.all([changing, saving]);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(expired.followUp).not.toHaveBeenCalled();
  await f.callbacks.collect(f.item("refresh"));
  await f.callbacks.collect(f.item("save"));
  expect(mocks.save).toHaveBeenLastCalledWith(
    f.root.client,
    "admin",
    expect.anything(),
    "server",
    [],
  );
});

test("failed acknowledgement invalidates duplicate consent and does not revive an expired panel", async () => {
  const f = await warned();
  const expired = f.item("servers", ["server-2"]);
  expired.deferUpdate.mockRejectedValueOnce({ code: 10062 });
  await f.callbacks.collect(expired);
  expect(rendered(f).controls.some((c: any) => c.label === "Keep Existing")).toBe(
    false,
  );
  await f.callbacks.collect(f.item(f.proceed));
  expect(mocks.save).toHaveBeenCalledOnce();
  let reject!: (error: unknown) => void;
  const next = f.item("refresh");
  next.deferUpdate.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  const refreshing = f.callbacks.collect(next);
  f.collector.ended = true;
  f.callbacks.end([], "time");
  const count = f.root.editReply.mock.calls.length;
  reject({ code: 10062 });
  await refreshing;
  expect(f.root.editReply).toHaveBeenCalledTimes(count);
  expect(next.followUp).not.toHaveBeenCalled();
});

test("Save sends the duplicate warning separately without editing settings", async () => {
  const f = fixture();
  await openCustomCommandSettings(f.root as never);
  await f.callbacks.collect(f.item("scope", ["all"]));
  const edits = f.root.editReply.mock.calls.length;
  mocks.save.mockRejectedValueOnce(duplicate());
  const save = f.item("save");
  await f.callbacks.collect(save);
  expect(f.root.editReply).toHaveBeenCalledTimes(edits);
  expect(warningRendered(f).text).toContain("Duplicate commands found");
  expect(rendered(f).text).not.toContain("Duplicate commands found");
  const cancel = warningRendered(f)
    .controls.find((c: any) => c.label === "Cancel")
    .custom_id.split(":")
    .at(-1);
  await f.warningCallbacks.collect(f.item(cancel));
  expect(f.root.editReply).toHaveBeenCalledTimes(edits);
  expect(f.warningEdit).toHaveBeenLastCalledWith(
    expect.objectContaining({
      content: expect.stringContaining("Cancelled"),
      components: [],
    }),
  );
  expect(mocks.save).toHaveBeenCalledOnce();
});

test("warning expiry removes buttons and invalidates its confirmation", async () => {
  const f = await warned();
  f.warningCallbacks.end([], "time");
  await f.callbacks.collect(f.item(f.proceed));
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(f.warningEdit).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining("expired"),
      components: [],
    }),
  );
});

test("an old Cancel cannot cancel a newer duplicate warning", async () => {
  const f = await warned();
  const oldCancel = warningRendered(f)
    .controls.find((c: any) => c.label === "Cancel")
    .custom_id.split(":")
    .at(-1);
  mocks.save.mockRejectedValueOnce(duplicate("new"));
  await f.warningCallbacks.collect(f.item(f.proceed));
  const proceed = warningRendered(f)
    .controls.find((c: any) => c.label === "Keep Existing")
    .custom_id.split(":")
    .at(-1);
  const stale = f.item(oldCancel);
  await f.callbacks.collect(stale);
  expect(stale.followUp).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining("no longer valid"),
    }),
  );
  await f.warningCallbacks.collect(f.item(proceed));
  expect(mocks.save).toHaveBeenLastCalledWith(
    f.root.client,
    "admin",
    expect.anything(),
    "selected",
    ["server-1"],
    "new",
  );
});


test("Replace Existing forwards the reviewed confirmation and replacement choice", async () => {
  const f = await warned();
  const replace = warningRendered(f).controls.find((control: any) => control.label === "Replace Existing").custom_id.split(":").at(-1);
  await f.warningCallbacks.collect(f.item(replace));
  expect(mocks.save).toHaveBeenLastCalledWith(f.root.client, "admin", expect.objectContaining({ id: 1 }), "selected", ["server-1"], "confirmation", "replace");
  await f.warningCallbacks.collect(f.item(replace));
  expect(mocks.save).toHaveBeenCalledTimes(2);
});
