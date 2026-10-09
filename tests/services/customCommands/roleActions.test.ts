import { EventEmitter } from "node:events";
import { expect, test, vi } from "vitest";
import { PermissionFlagsBits, PermissionsBitField } from "discord.js";
vi.mock("../../../src/adapters/logging/runtime.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));
import { executeRoleAction } from "../../../src/modules/custom-commands/discord/roleActions.js";
import { attachStageNavigation } from "../../../src/modules/custom-commands/discord/stageNavigation.js";
import { CustomCommandExecutor } from "../../../src/modules/custom-commands/discord/CustomCommandExecutor.js";
import { CustomCommandRenderer } from "../../../src/modules/custom-commands/discord/CustomCommandRenderer.js";
import { markdownPatch } from "../../../src/modules/custom-commands/discord/markdown.js";
import { context, record, MemoryRepository, ROLE, USER } from "./fixtures.js";

function setup(
  source = `@main
Roles
@button success [Join](SetRole(${ROLE}))
@button secondary [Toggle](ToggleRole(${ROLE}))
@select Choose
@option [Join](SetRole(${ROLE}))
@option [Leave](RemoveRole(${ROLE}))
@option [Rules](Go(stage(1)))
@endselect
@stage(1)
Rules
@button [Home](Main)`,
) {
  const ctx = context({ command: record(markdownPatch(source)) });
  const cache = new Map<string, object>();
  const add = vi.fn(async (id: string) => {
    cache.set(id, {});
  });
  const remove = vi.fn(async (id: string) => {
    cache.delete(id);
  });
  Object.assign(ctx.member, {
    manageable: true,
    roles: { cache, add, remove },
  });
  const me = {
    id: "bot",
    permissions: new PermissionsBitField([PermissionFlagsBits.ManageRoles]),
    roles: { highest: { comparePositionTo: vi.fn().mockReturnValue(1) } },
  };
  const role = { id: ROLE, guild: { id: ctx.guildId }, managed: false };
  const fetch = vi.fn().mockResolvedValue(ctx.member);
  const fetchMe = vi.fn().mockResolvedValue(me);
  const fetchRole = vi.fn().mockResolvedValue(role);
  Object.assign(ctx.guild.members, { me, fetch, fetchMe });
  Object.assign(ctx.guild, { roles: { fetch: fetchRole } });
  const loadCommand = vi.fn().mockResolvedValue(ctx.command);
  const active = vi.fn().mockReturnValue(true);
  const execute = (
    action: "addrole" | "removerole" | "togglerole" = "addrole",
  ) => executeRoleAction(ctx, { action, roleId: ROLE }, loadCommand, active);
  const collector = new EventEmitter() as EventEmitter & {
    stop: ReturnType<typeof vi.fn>;
  };
  collector.stop = vi.fn((reason) => collector.emit("end", [], reason));
  const message = {
    createMessageComponentCollector: vi.fn((_options: unknown) => collector),
    edit: vi.fn().mockResolvedValue(undefined),
  };
  const interaction = (id: string, values?: string[]) => ({
    customId: id,
    user: { id: USER },
    values: values ?? [],
    isButton: () => values === undefined,
    isStringSelectMenu: () => values !== undefined,
    reply: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  });
  const collect = (click: ReturnType<typeof interaction>) =>
    (
      collector.listeners("collect")[0] as (
        click: ReturnType<typeof interaction>,
      ) => Promise<void>
    )(click);
  const attach = async (preview = false) =>
    attachStageNavigation(
      message,
      ctx,
      await new CustomCommandRenderer().render(ctx, true),
      { preview, loadCommand },
    );
  return {
    ctx,
    cache,
    add,
    remove,
    me,
    role,
    fetch,
    fetchMe,
    fetchRole,
    loadCommand,
    active,
    execute,
    collector,
    message,
    interaction,
    collect,
    attach,
  };
}

test("role changes refresh membership and hierarchy, modify only the configured role, and are idempotent", async () => {
  const s = setup();
  s.cache.set("unrelated", {});
  expect(await s.execute()).toBe("Role added.");
  expect(await s.execute()).toBe("Role added.");
  expect(s.add).toHaveBeenCalledExactlyOnceWith(
    ROLE,
    expect.stringContaining("Custom command welcome (1)"),
  );
  expect(s.fetch).toHaveBeenCalledWith({ user: USER, force: true });
  expect(s.fetchMe).toHaveBeenCalledWith({ force: true });
  expect(s.fetchRole).toHaveBeenCalledWith(ROLE, { force: true });
  expect(await s.execute("togglerole")).toBe("Role removed.");
  expect(await s.execute("removerole")).toBe("Role removed.");
  expect(s.remove).toHaveBeenCalledOnce();
  expect(await s.execute("togglerole")).toBe("Role added.");
  expect(s.add).toHaveBeenCalledTimes(2);
  expect(s.cache.has("unrelated")).toBe(true);
});

test.each([
  "deleted",
  "changed",
  "content changed at same revision",
  "disabled",
  "foreign command",
  "foreign source",
  "denied member",
  "missing required permission",
  "foreign role",
  "everyone",
  "managed",
  "deleted role",
  "bot permissions",
  "bot hierarchy",
  "unmanageable member",
  "expired",
])("role actions reject %s without a mutation", async (reason) => {
  const s = setup();
  switch (reason) {
    case "deleted":
      s.loadCommand.mockResolvedValue(undefined);
      break;
    case "changed":
      s.loadCommand.mockResolvedValue({ ...s.ctx.command, updatedAt: "later" });
      break;
    case "content changed at same revision":
      s.loadCommand.mockResolvedValue({
        ...s.ctx.command,
        content: [{ type: "TEXT", text: "No roles anymore" }],
      });
      break;
    case "disabled":
      s.loadCommand.mockResolvedValue({ ...s.ctx.command, enabled: false });
      break;
    case "foreign command":
      s.loadCommand.mockResolvedValue({ ...s.ctx.command, id: 99 });
      break;
    case "foreign source":
      s.ctx.command.sourceGuildId = "elsewhere";
      break;
    case "denied member":
      s.ctx.command.deniedRoleIds = [ROLE];
      s.cache.set(ROLE, {});
      break;
    case "missing required permission":
      s.ctx.command.requiredUserPermissions = ["Administrator"];
      break;
    case "foreign role":
      s.role.guild.id = "elsewhere";
      break;
    case "everyone":
      s.role.id = s.ctx.guildId;
      break;
    case "managed":
      s.role.managed = true;
      break;
    case "deleted role":
      s.fetchRole.mockResolvedValue(null);
      break;
    case "bot permissions":
      s.me.permissions.remove(PermissionFlagsBits.ManageRoles);
      break;
    case "bot hierarchy":
      s.me.roles.highest.comparePositionTo.mockReturnValue(0);
      break;
    case "unmanageable member":
      Object.assign(s.ctx.member, { manageable: false });
      break;
    case "expired":
      s.active.mockReturnValue(false);
      break;
  }
  await expect(s.execute()).rejects.toThrow();
  expect(s.add).not.toHaveBeenCalled();
  expect(s.remove).not.toHaveBeenCalled();
});

test("button and select actions execute through the real executor; clicks do not recount usage", async () => {
  const s = setup();
  const repository = new MemoryRepository();
  repository.records = [s.ctx.command];
  await new CustomCommandExecutor(repository).execute(s.ctx, {
    send: vi.fn().mockResolvedValue(s.message),
  });
  const join = s.interaction("cc-stage:0:0");
  await s.collect(join);
  expect(join.deferReply).toHaveBeenCalledWith({ flags: 64 });
  expect(join.editReply).toHaveBeenCalledWith({
    content: "Role added.",
    allowedMentions: { parse: [] },
  });
  const leave = s.interaction("cc-select:0:0", ["1"]);
  await s.collect(leave);
  expect(s.remove).toHaveBeenCalledOnce();
  expect(leave.editReply).toHaveBeenCalledWith(
    expect.objectContaining({ content: "Role removed." }),
  );
  const navigate = s.interaction("cc-select:0:0", ["2"]);
  await s.collect(navigate);
  expect(navigate.update).toHaveBeenCalledWith(
    expect.objectContaining({ content: null, embeds: expect.any(Array) }),
  );
  await s.collect(s.interaction("cc-stage:1:0"));
  expect(repository.recordUsage).toHaveBeenCalledOnce();
  repository.records[0] = { ...s.ctx.command, updatedAt: "new revision" };
  const stale = s.interaction("cc-stage:0:0");
  await s.collect(stale);
  expect(stale.editReply).toHaveBeenCalledWith(
    expect.objectContaining({ content: expect.stringContaining("changed") }),
  );
  expect(s.add).toHaveBeenCalledOnce();
});

test("preview role buttons and select options report without executing; navigation still works", async () => {
  const s = setup();
  await s.attach(true);
  for (const click of [
    s.interaction("cc-stage:0:0"),
    s.interaction("cc-select:0:0", ["0"]),
  ]) {
    await s.collect(click);
    expect(click.reply).toHaveBeenCalledWith({
      content: "Preview only — roles are not changed.",
      flags: 64,
    });
  }
  const nav = s.interaction("cc-select:0:0", ["2"]);
  await s.collect(nav);
  expect(nav.update).toHaveBeenCalledOnce();
  expect(s.loadCommand).not.toHaveBeenCalled();
  expect(s.fetch).not.toHaveBeenCalled();
  expect(s.add).not.toHaveBeenCalled();
});

test("foreign users, forged selections, wrong component types, stale stages and ended collectors cannot mutate roles", async () => {
  const s = setup();
  await s.attach();
  const foreign = s.interaction("cc-select:0:0", ["0"]);
  foreign.user.id = "other";
  await s.collect(foreign);
  expect(foreign.reply).toHaveBeenCalledWith(
    expect.objectContaining({ flags: 64 }),
  );
  for (const click of [
    s.interaction("cc-select:0:0", [ROLE]),
    s.interaction("cc-select:0:0", ["-1"]),
    s.interaction("cc-select:0:0", ["01"]),
    s.interaction("cc-select:0:0", ["99"]),
    s.interaction("cc-select:0:0", []),
    s.interaction("cc-select:0:0", ["0", "1"]),
    s.interaction("cc-select:0:99", ["0"]),
    s.interaction("cc-select:1:0", ["0"]),
    s.interaction("cc-stage:0:0", ["0"]),
    s.interaction("cc-select:0:0"),
    s.interaction("cc-stage:0:99"),
    s.interaction("cc-response:0:0"),
  ]) {
    await s.collect(click);
    expect(click.deferUpdate).toHaveBeenCalledOnce();
  }
  s.collector.emit("end");
  await s.collect(s.interaction("cc-stage:0:0"));
  expect(s.message.edit).toHaveBeenCalledWith({ components: [] });
  expect(s.add).not.toHaveBeenCalled();
  expect(s.loadCommand).not.toHaveBeenCalled();
});

test("failed acknowledgement applies no role; Discord errors are private and retryable", async () => {
  const s = setup();
  await s.attach();
  const unacknowledged = s.interaction("cc-stage:0:0");
  unacknowledged.deferReply.mockRejectedValue(new Error("network"));
  await s.collect(unacknowledged);
  expect(s.add).not.toHaveBeenCalled();
  s.add.mockRejectedValueOnce(new Error("Discord rejected"));
  const failed = s.interaction("cc-stage:0:0");
  await s.collect(failed);
  expect(failed.editReply).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining("could not change"),
    }),
  );
  await s.collect(s.interaction("cc-stage:0:0"));
  expect(s.add).toHaveBeenCalledTimes(2);
});

test("concurrent role clicks are acknowledged and expiration during authorization prevents mutation", async () => {
  const s = setup();
  await s.attach();
  let finish!: (command: typeof s.ctx.command) => void;
  s.loadCommand.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = s.collect(s.interaction("cc-stage:0:0"));
  await vi.waitFor(() => expect(s.loadCommand).toHaveBeenCalledOnce());
  const concurrent = s.interaction("cc-stage:0:1");
  await s.collect(concurrent);
  expect(concurrent.deferUpdate).toHaveBeenCalledOnce();
  s.collector.emit("end");
  finish(s.ctx.command);
  await pending;
  expect(s.add).not.toHaveBeenCalled();
});

test("unstaged role components attach collectors to every delivered response", async () => {
  const s = setup(
    `:::text\nFirst\n@button [Join](SetRole(${ROLE}))\n:::\n:::text\nSecond\n@select Roles\n@option [Join](AddRole(${ROLE}))\n@endselect\n:::`,
  );
  const repository = new MemoryRepository();
  repository.records = [s.ctx.command];
  const firstCollector = Object.assign(new EventEmitter(), { stop: vi.fn() });
  const first = {
    createMessageComponentCollector: vi.fn().mockReturnValue(firstCollector),
    edit: vi.fn().mockResolvedValue(undefined),
  };
  const send = vi
    .fn()
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce(s.message);
  await new CustomCommandExecutor(repository).execute(s.ctx, { send });
  expect(first.createMessageComponentCollector).toHaveBeenCalledOnce();
  expect(s.message.createMessageComponentCollector).toHaveBeenCalledOnce();
  const wrongMessage = s.interaction("cc-select:0:0", ["0"]);
  await s.collect(wrongMessage);
  expect(wrongMessage.deferUpdate).toHaveBeenCalledOnce();
  await s.collect(s.interaction("cc-select:1:0", ["0"]));
  expect(s.add).toHaveBeenCalledOnce();
});
