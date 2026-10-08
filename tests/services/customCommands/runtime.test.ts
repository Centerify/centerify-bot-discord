import { currentApplication } from "../../../src/adapters/discord/context.js";
import { customCommandsToken } from "../../../src/modules/custom-commands/index.js";
import { executorToken, sharingToken } from "../../../src/modules/custom-commands/discord/tokens.js";
import { beforeEach, expect, test, vi } from "vitest";
import { Collection, type Message } from "discord.js";
import { container } from "@sapphire/framework";
vi.mock("../../../src/adapters/prisma/client.js", () => ({ db: {} }));
vi.mock("../../../src/adapters/logging/runtime.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
import {
  customCommandExecutor,
  customCommandService,
  customCommandSharingService,
  runDomainCustomCommand,
} from "../../../src/modules/custom-commands/discord/runtime.js";
import { isBuiltInCommand } from "../../../src/modules/custom-commands/discord/reservedNames.js";
import { context, record } from "./fixtures.js";
function fixture(content = "!welcome John") {
  const c = context();
  return {
    content,
    guild: c.guild,
    member: c.member,
    author: { id: c.userId, bot: false },
    channel: { ...c.channel, isDMBased: () => false, send: vi.fn() },
    reply: vi.fn(),
    delete: vi.fn(),
    webhookId: null,
    system: false,
  };
}
beforeEach(() => vi.restoreAllMocks());
test("message fast paths do not access the repository", async () => {
  const lookup = vi.spyOn(currentApplication().resolve(customCommandsToken), "getCommandByNameOrAlias");
  for (const message of [
    { ...fixture(), guild: null },
    { ...fixture(), author: { bot: true } },
    fixture("ordinary message"),
    { ...fixture(), webhookId: "hook" },
    { ...fixture(), system: true },
    fixture(`!${"x".repeat(2200)}`),
  ])
    expect(await runDomainCustomCommand(message as unknown as Message)).toBe(
      false,
    );
  expect(lookup).not.toHaveBeenCalled();
});
test("prefix arguments normalize whitespace; canonical executor handles reply and deletion", async () => {
  const command = record();
  const lookup = vi
    .spyOn(currentApplication().resolve(customCommandsToken), "getCommandByNameOrAlias")
    .mockResolvedValue(command);
  const executor = vi
    .spyOn(currentApplication().resolve(executorToken), "execute")
    .mockImplementation(async (_context, transport) => {
      await transport.send({ content: "ok" }, 0);
    });
  const message = fixture("!welcome\tJohn\nDoe");
  expect(await runDomainCustomCommand(message as unknown as Message)).toBe(
    true,
  );
  expect(lookup).toHaveBeenCalledWith("guild-a", "welcome");
  expect(executor).toHaveBeenCalledWith(
    expect.objectContaining({ args: ["John", "Doe"], source: "message" }),
    expect.any(Object),
  );
  expect(message.reply).toHaveBeenCalledOnce();
  command.deleteInvocation = true;
  await runDomainCustomCommand(message as unknown as Message);
  expect(message.channel.send).toHaveBeenCalledOnce();
});
test("unknown commands fall through; Sapphire registry names and aliases are protected", async () => {
  vi.spyOn(currentApplication().resolve(sharingToken), "resolve").mockResolvedValue(null);
  vi.spyOn(currentApplication().resolve(customCommandsToken), "getCommandByNameOrAlias").mockResolvedValue(
    null,
  );
  expect(await runDomainCustomCommand(fixture() as unknown as Message)).toBe(
    false,
  );
  const descriptor = Object.getOwnPropertyDescriptor(container, "stores");
  Object.defineProperty(container, "stores", {
    configurable: true,
    value: {
      get: () =>
        new Collection([
          [
            "builtin",
            {
              name: "builtin",
              aliases: ["alias"],
              applicationCommandRegistry: {
                apiCalls: [{ builtData: { name: "slashname" } }],
              },
            },
          ],
        ]),
    },
  });
  try {
    expect(isBuiltInCommand("BUILTIN")).toBe(true);
    expect(isBuiltInCommand("alias")).toBe(true);
    expect(isBuiltInCommand("slashname")).toBe(true);
  } finally {
    if (descriptor) Object.defineProperty(container, "stores", descriptor);
    else Reflect.deleteProperty(container, "stores");
  }
});

test("local commands take precedence and unknown local names fall back to authorized sharing", async () => {
  const local = vi
    .spyOn(currentApplication().resolve(customCommandsToken), "getCommandByNameOrAlias")
    .mockResolvedValue(record({ enabled: false }));
  const shared = vi
    .spyOn(currentApplication().resolve(sharingToken), "resolve")
    .mockResolvedValue(record({ sourceGuildId: "source-server" }));
  const executor = vi
    .spyOn(currentApplication().resolve(executorToken), "execute")
    .mockResolvedValue(undefined);
  expect(await runDomainCustomCommand(fixture() as unknown as Message)).toBe(
    true,
  );
  expect(shared).not.toHaveBeenCalled();
  local.mockResolvedValue(null);
  expect(await runDomainCustomCommand(fixture() as unknown as Message)).toBe(
    true,
  );
  expect(shared).toHaveBeenCalledOnce();
  expect(executor).toHaveBeenLastCalledWith(
    expect.objectContaining({
      command: expect.objectContaining({ sourceGuildId: "source-server" }),
    }),
    expect.any(Object),
  );
});
