import { expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
vi.mock("../../../src/adapters/logging/runtime.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));
import {
  markdownPatch,
  parseCommandMarkdown,
  parseVariableDefinitions,
  serializeCommandMarkdown,
} from "../../../src/modules/custom-commands/discord/markdown.js";
import { CustomCommandRenderer } from "../../../src/modules/custom-commands/discord/CustomCommandRenderer.js";
import { CustomCommandVariableResolver } from "../../../src/modules/custom-commands/discord/CustomCommandVariableResolver.js";
import { renderComponentAction } from "../../../src/modules/custom-commands/discord/actionTemplates.js";
import { CustomCommandValidator } from "../../../src/modules/custom-commands/domain/CustomCommandValidator.js";
import { hasServerActionReferences } from "../../../src/modules/custom-commands/domain/components.js";
import { CustomCommandService } from "../../../src/modules/custom-commands/application/CustomCommandService.js";
import {
  context,
  definition,
  record,
  MemoryRepository,
  USER,
  CHANNEL,
} from "./fixtures.js";

test("custom variables render across pages, labels, dropdowns and actions, and survive cfg round trips", async () => {
  const source = `@var USER_ID = {user.id}
@var GREETING = Hello {user.name} ({USER_ID})!
@main
@title {GREETING}
@button [Next for {USER_ID}](Go(stage(1)))
@stage(1)
@title Details
{GREETING}
@select Choose for {USER_ID}
@option [Reply to {USER_ID}](Reply("{GREETING}"))
@endselect`;
  const patch = markdownPatch(source);
  expect(parseCommandMarkdown(serializeCommandMarkdown(patch.content))).toEqual(
    patch.content,
  );
  const ctx = context({ command: record(patch) });
  const payloads = await new CustomCommandRenderer().render(ctx, true);
  expect(JSON.stringify(payloads[0].embeds)).toContain(`Hello Alex (${USER})!`);
  expect(JSON.stringify(payloads[1].components)).toContain(`Reply to ${USER}`);
  expect(
    await renderComponentAction(patch.content[1].selects![0].options[0], ctx),
  ).toMatchObject({
    action: "reply",
    text: `Hello Alex (${USER})!`,
  });
});

test("the complete welcome example saves, reopens and renders GREETING and its dropdown", async () => {
  const source = readFileSync("docs/welcome-example.cfg", "utf8");
  const service = new CustomCommandService(new MemoryRepository());
  await service.createCommand("guild-a", USER, definition());
  await service.updateCommand(
    "guild-a",
    USER,
    "welcome",
    markdownPatch(source),
  );
  const command = (await service.getCommand("guild-a", "welcome"))!;
  expect(
    parseCommandMarkdown(serializeCommandMarkdown(command.content)),
  ).toEqual(command.content);
  const ctx = context({ command });
  ctx.member.user.displayAvatarURL = () => "https://example.com/avatar.png";
  const payloads = await new CustomCommandRenderer().render(ctx, true);
  expect(JSON.stringify(payloads[0].embeds)).toContain(`Hello <@${USER}>!`);
  expect(
    await renderComponentAction(command.content[0].selects![0].options[1], ctx),
  ).toMatchObject({
    action: "reply",
    text: `Your user ID is ${USER}`,
  });
});

test("editing a template can use saved variables without repeating their definitions", () => {
  const saved = { USER_ID: "{user.id}", GREETING: "Hello {user.mention}!" };
  const patch = markdownPatch(
    '@main\n@title Welcome\n{GREETING}\n@button [My ID](Reply("{USER_ID}"))',
    saved,
  );
  expect(patch.content[0]).toMatchObject({
    variables: saved,
    embed: { description: "{GREETING}" },
  });
  expect(
    markdownPatch("@var GREETING = Hi {user.name}!\n@main\n{GREETING}", saved)
      .content[0].variables,
  ).toEqual({
    USER_ID: "{user.id}",
    GREETING: "Hi {user.name}!",
  });
  expect(saved.GREETING).toBe("Hello {user.mention}!");
});

test("custom action target aliases resolve invocation arguments", async () => {
  const patch = markdownPatch(
    '@var USER_ID = {args.0}\nHello\n@button [Warn](Warn("{USER_ID}", "Reason"))',
  );
  const ctx = context({ command: record(patch), args: [USER] });
  expect(
    await renderComponentAction(patch.content[0].buttons![0] as never, ctx),
  ).toMatchObject({ action: "warn", userId: USER });
  expect(hasServerActionReferences(patch.content)).toBe(false);
  expect(patch.content[0]).toMatchObject({ text: "Hello" });
});

test("fixed action targets in nested custom aliases retain guild-local validation", () => {
  const patch = markdownPatch(
    `@var USER_ID = ${USER}\n@var TARGET = {USER_ID}\n@var CHANNEL_ID = ${CHANNEL}\nHello\n@button [Warn](Warn("{TARGET}", "Reason"))\n@button [Send](SendMessage("{CHANNEL_ID}", "Hello"))`,
  );
  expect(hasServerActionReferences(patch.content)).toBe(true);
  expect(
    hasServerActionReferences(
      markdownPatch(
        `@var TARGET = <@${USER}>\nHello\n@button [Warn](Warn("{TARGET}", "Reason"))`,
      ).content,
    ),
  ).toBe(true);
});

test("variables persist through service updates and JSON export/import", async () => {
  const service = new CustomCommandService(new MemoryRepository());
  const patch = markdownPatch(
    "@var USER_ID = {user.id}\n:::text\nID: {USER_ID}\n:::",
  );
  await service.createCommand("guild-a", USER, definition(patch));
  await service.updateCommand("guild-a", USER, "welcome", {
    description: "Updated",
  });
  await service.importCommands(
    "guild-b",
    USER,
    await service.exportCommands("guild-a"),
  );
  const loaded = (await service.getCommand("guild-b", "welcome"))!;
  expect(loaded.content[0].variables).toEqual({ USER_ID: "{user.id}" });
  expect(
    (await new CustomCommandRenderer().render(context({ command: loaded })))[0]
      .content,
  ).toBe(`ID: ${USER}`);
});

test("variable editor accepts definitions, quoted values and clearing", () => {
  expect(
    parseVariableDefinitions(
      'USER_ID = {user.id}\nMESSAGE = " Hello\\n{USER_ID} "',
    ),
  ).toEqual({ USER_ID: "{user.id}", MESSAGE: " Hello\n{USER_ID} " });
  expect(parseVariableDefinitions("")).toEqual({});
  expect(parseVariableDefinitions("@var USER_ID = {user.id}")).toEqual({
    USER_ID: "{user.id}",
  });
});

test.each([
  "@var A = {A}",
  "@var A = {B}\n@var B = {A}",
  "@var USER_ID = {unknown}",
  "@var USER_ID = {user.id}\n@var USER_ID = duplicate",
  "@var lower_case = value",
  "@var USER_ID = " + "x".repeat(2001),
  Array.from({ length: 26 }, (_, i) => `@var VAR_${i} = value`).join("\n"),
])("invalid custom definitions fail before saving: %s", (header) => {
  expect(() =>
    parseCommandMarkdown(`${header}\n:::text\nHello\n:::`),
  ).toThrow();
});

test("JSON definitions reject duplicates, unknown uses, malformed maps and custom URL placeholders", () => {
  const validator = new CustomCommandValidator();
  expect(() =>
    validator.responses([
      { type: "TEXT", text: "One", variables: { USER_ID: "first" } },
      { type: "TEXT", text: "Two", variables: { USER_ID: "second" } },
    ]),
  ).toThrow("unique");
  for (const variables of [
    null,
    [],
    "bad",
    { USER_ID: 123 },
    { lower: "value" },
  ])
    expect(() =>
      validator.responses([{ type: "TEXT", text: "Hello", variables }]),
    ).toThrow();
  expect(() =>
    validator.responses([{ type: "TEXT", text: "{USER_ID}" }]),
  ).toThrow("Unknown variable");
  expect(() =>
    validator.responses([
      {
        type: "EMBED",
        embed: { title: "Title", thumbnail: { url: "{IMAGE}" } },
        variables: { IMAGE: "{user.avatar}" },
      },
    ]),
  ).toThrow("HTTPS");
});

test("expanded variable values are bounded and invocation values stay literal", async () => {
  const content = [
    {
      type: "TEXT" as const,
      text: "{BIG}",
      variables: {
        A: "x".repeat(2000),
        B: "{A}{A}{A}{A}",
        BIG: "{B}{B}{B}{B}",
      },
    },
  ];
  await expect(
    new CustomCommandRenderer().render(
      context({ command: record({ content }) }),
    ),
  ).rejects.toThrow("too long");
  const patch = markdownPatch("@var INPUT = {args.0}\n:::text\n{INPUT}\n:::");
  expect(
    await new CustomCommandVariableResolver().render(
      "{INPUT}",
      context({ command: record(patch), args: ["{user.id}"] }),
    ),
  ).toBe("{user.id}");
});
