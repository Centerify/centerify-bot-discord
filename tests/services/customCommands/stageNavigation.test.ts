import { EventEmitter } from "node:events";
import { expect, test, vi } from "vitest";
vi.mock("../../../src/adapters/logging/runtime.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));
import { CustomCommandExecutor } from "../../../src/modules/custom-commands/discord/CustomCommandExecutor.js";
import { CustomCommandRenderer } from "../../../src/modules/custom-commands/discord/CustomCommandRenderer.js";
import { attachStageNavigation } from "../../../src/modules/custom-commands/discord/stageNavigation.js";
import { markdownPatch } from "../../../src/modules/custom-commands/discord/markdown.js";
import { context, record, MemoryRepository, USER } from "./fixtures.js";

const source = `:::text
@stage(2)
Details
@button secondary [Back](Back(stage(0)))
@button success [Home](Main)
:::
:::embed
@main
@title Welcome
@button primary [Next](Go(stage(2)))
@button danger [Close](Cancel)
:::`;
function setup() {
  const ctx = context({ command: record(markdownPatch(source)) });
  const collector = new EventEmitter() as EventEmitter & {
    stop: ReturnType<typeof vi.fn>;
  };
  collector.stop = vi.fn((reason) => collector.emit("end", [], reason));
  const message = {
    createMessageComponentCollector: vi.fn((_options: unknown) => collector),
    edit: vi.fn().mockResolvedValue(undefined),
  };
  const click = async (id: string, userId = USER) => {
    const interaction = {
      customId: id,
      user: { id: userId },
      isButton: () => true,
      isStringSelectMenu: () => false,
      reply: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      deferUpdate: vi.fn().mockResolvedValue(undefined),
    };
    const handler = collector.listeners("collect")[0] as (
      value: typeof interaction,
    ) => Promise<void>;
    await handler(interaction);
    return interaction;
  };
  return { ctx, collector, message, click };
}

test("execution sends only main, attaches navigation and counts usage once", async () => {
  const { ctx, message, click, collector } = setup();
  const repository = new MemoryRepository();
  const send = vi.fn().mockResolvedValue(message);
  await new CustomCommandExecutor(repository).execute(ctx, { send });
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][1]).toBe(0);
  expect(send.mock.calls[0][0].embeds[0].toJSON().title).toBe("Welcome");
  expect(
    message.createMessageComponentCollector.mock.calls[0][0],
  ).toMatchObject({ time: 900_000 });
  const next = await click("cc-stage:0:0");
  expect(next.update).toHaveBeenCalledWith(
    expect.objectContaining({ content: "Details", embeds: [] }),
  );
  const back = await click("cc-stage:2:0");
  expect(back.update).toHaveBeenCalledWith(
    expect.objectContaining({ content: null }),
  );
  await click("cc-stage:0:0");
  expect((await click("cc-stage:2:1")).update).toHaveBeenCalled();
  const cancel = await click("cc-stage:0:1");
  expect(cancel.update).toHaveBeenCalledWith({ components: [] });
  expect(collector.stop).toHaveBeenCalledWith("cancelled");
  expect(repository.recordUsage).toHaveBeenCalledTimes(1);
});

test("navigation rejects other users, stale buttons and invalid IDs; expires controls", async () => {
  const { ctx, message, click, collector } = setup();
  attachStageNavigation(
    message,
    ctx,
    await new CustomCommandRenderer().render(ctx, true),
  );
  const foreign = await click("cc-stage:0:0", "other");
  expect(foreign.reply).toHaveBeenCalledWith(
    expect.objectContaining({ flags: 64 }),
  );
  expect(foreign.update).not.toHaveBeenCalled();
  for (const id of ["cc-stage:2:0", "cc-stage:0:99", "cc-stage:invalid"]) {
    const stale = await click(id);
    expect(stale.deferUpdate).toHaveBeenCalled();
    expect(stale.update).not.toHaveBeenCalled();
  }
  collector.emit("end", [], "time");
  expect(message.edit).toHaveBeenCalledWith({ components: [] });
});

test("failed updates keep the current stage and allow a retry", async () => {
  const { ctx, message, collector, click } = setup();
  attachStageNavigation(
    message,
    ctx,
    await new CustomCommandRenderer().render(ctx, true),
  );
  const handler = collector.listeners("collect")[0] as (
    value: unknown,
  ) => Promise<void>;
  await handler({
    customId: "cc-stage:0:0",
    user: { id: USER },
    isButton: () => true,
    update: vi.fn().mockRejectedValue(new Error("network")),
  });
  expect((await click("cc-stage:0:0")).update).toHaveBeenCalled();
});

test("concurrent clicks are acknowledged without racing stage updates", async () => {
  const { ctx, message, collector, click } = setup();
  attachStageNavigation(
    message,
    ctx,
    await new CustomCommandRenderer().render(ctx, true),
  );
  let finish!: () => void;
  const update = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const handler = collector.listeners("collect")[0] as (
    value: unknown,
  ) => Promise<void>;
  const pending = handler({
    customId: "cc-stage:0:0",
    user: { id: USER },
    isButton: () => true,
    update,
  });
  expect((await click("cc-stage:0:1")).deferUpdate).toHaveBeenCalled();
  finish();
  await pending;
  expect((await click("cc-stage:2:0")).update).toHaveBeenCalled();
});
