import { EventEmitter } from "node:events";
import { expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("../../../src/adapters/logging/runtime.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../src/adapters/discord/context.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/adapters/discord/context.js")
  >("../../../src/adapters/discord/context.js");
  return {
    ...actual,
    serviceRef: (token: { name: string }) =>
      token.name === "custom-commands.discord.sharing"
        ? { resolve: mocks.resolve }
        : actual.serviceRef(token as never),
  };
});
import { CustomCommandExecutor } from "../../../src/modules/custom-commands/discord/CustomCommandExecutor.js";
import { context, record, MemoryRepository, USER } from "./fixtures.js";

async function setup() {
  mocks.resolve.mockReset();
  const saved = record({
    guildId: "source",
    content: [
      {
        type: "TEXT",
        text: "Actions",
        buttons: [
          {
            label: "Reply",
            action: "reply",
            text: "Hello {user.name}",
            repeatable: true,
          },
        ],
      },
    ],
  });
  const projected = { ...saved, guildId: "guild-a", sourceGuildId: "source" };
  const ctx = context({ command: projected });
  Object.assign(ctx.guild.members, {
    fetch: vi.fn().mockResolvedValue(ctx.member),
    fetchMe: vi.fn().mockResolvedValue(ctx.guild.members.me),
  });
  const repository = new MemoryRepository();
  repository.records = [saved];
  mocks.resolve.mockResolvedValue(projected);
  const collector = Object.assign(new EventEmitter(), { stop: vi.fn() });
  const message = {
    createMessageComponentCollector: vi.fn().mockReturnValue(collector),
    edit: vi.fn().mockResolvedValue(undefined),
  };
  await new CustomCommandExecutor(repository).execute(ctx, {
    send: vi.fn().mockResolvedValue(message),
  });
  const click = async () => {
    const interaction = {
      customId: "cc-response:0:0",
      user: { id: USER },
      isButton: () => true,
      isStringSelectMenu: () => false,
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      deferUpdate: vi.fn().mockResolvedValue(undefined),
    };
    await (
      collector.listeners("collect")[0] as (
        value: typeof interaction,
      ) => Promise<void>
    )(interaction);
    return interaction;
  };
  return { repository, projected, ctx, click };
}

test("shared action clicks reauthorize sharing while loading fresh source definitions", async () => {
  const s = await setup();
  const click = await s.click();
  expect(click.editReply).toHaveBeenCalledWith({
    content: "Hello Alex",
    allowedMentions: { parse: [] },
  });
  expect(mocks.resolve).toHaveBeenCalledWith(
    s.ctx.guild.client,
    s.ctx.guild,
    "welcome",
  );
  expect(s.repository.list).toHaveBeenCalledWith("source");
  expect(s.repository.recordUsage).toHaveBeenCalledExactlyOnceWith("source", 1);
  mocks.resolve.mockResolvedValue(null);
  const revoked = await s.click();
  expect(revoked.editReply).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining("changed or was deleted"),
    }),
  );
});

test.each(["disabled", "edited", "different command", "different source"])(
  "shared actions reject %s state before an effect",
  async (condition) => {
    const s = await setup();
    if (condition === "disabled") s.repository.records[0].enabled = false;
    if (condition === "edited")
      s.repository.records[0].content = [{ type: "TEXT", text: "Replaced" }];
    if (condition === "different command")
      mocks.resolve.mockResolvedValue({ ...s.projected, id: 99 });
    if (condition === "different source")
      mocks.resolve.mockResolvedValue({
        ...s.projected,
        sourceGuildId: "other",
      });
    const click = await s.click();
    expect(click.editReply).not.toHaveBeenCalledWith(
      expect.objectContaining({ content: "Hello Alex" }),
    );
    expect(click.editReply).toHaveBeenCalledOnce();
  },
);
