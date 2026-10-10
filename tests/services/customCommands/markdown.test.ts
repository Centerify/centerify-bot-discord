import { expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
vi.mock("../../../src/adapters/logging/runtime.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));
import {
  parseCommandMarkdown,
  serializeCommandMarkdown,
  markdownPatch,
  MARKDOWN_EXAMPLE,
  MARKDOWN_HELP,
} from "../../../src/modules/custom-commands/discord/markdown.js";
import { CustomCommandRenderer } from "../../../src/modules/custom-commands/discord/CustomCommandRenderer.js";
import { CustomCommandValidator } from "../../../src/modules/custom-commands/domain/CustomCommandValidator.js";
import { CustomCommandService } from "../../../src/modules/custom-commands/application/CustomCommandService.js";
import { context, record, MemoryRepository, definition } from "./fixtures.js";

const validator = new CustomCommandValidator();
test("Markdown parses text, embeds, covers, fields and working link buttons", async () => {
  const source = `:::text
Hello {user.mention}! **Welcome to {guild.name}.**
:::

:::embed
@title Welcome to {guild.name}
@color #5865f2
@cover https://example.com/cover.png
@field Members
{guild.memberCount}
@endfield
@button [Read the rules](https://example.com/rules)
:::`;
  const patch = markdownPatch(source);
  expect(patch.responseType).toBe("MULTI");
  expect(patch.content[1]).toMatchObject({
    type: "EMBED",
    embed: {
      title: "Welcome to {guild.name}",
      color: 0x5865f2,
      image: { url: "https://example.com/cover.png" },
      fields: [{ name: "Members", value: "{guild.memberCount}" }],
    },
    buttons: [{ label: "Read the rules", url: "https://example.com/rules" }],
  });
  const payloads = await new CustomCommandRenderer().render(
    context({ command: record(patch) }),
  );
  const row = payloads[1].components![0];
  expect("toJSON" in row ? row.toJSON() : row).toMatchObject({
    type: 1,
    components: [
      {
        type: 2,
        style: 5,
        label: "Read the rules",
        url: "https://example.com/rules",
      },
    ],
  });
  expect(payloads[0].content).toContain("**Welcome to Centerify Community.**");
});

test("the downloadable syntax example has a working Rules page", () => {
  const content = parseCommandMarkdown(MARKDOWN_EXAMPLE);
  expect(content).toHaveLength(2);
  expect(content[0].stage).toBe(0);
  expect(content[0].buttons?.[0]).toMatchObject({
    label: "Rules",
    action: "go",
    target: 1,
  });
  expect(content[1]).toMatchObject({
    stage: 1,
    embed: { title: "Server Rules" },
  });
  expect(content[1].type === "EMBED" && content[1].embed.description).toContain(
    "<#123456789012345678>",
  );
  expect(MARKDOWN_HELP.length).toBeLessThanOrEqual(2000);
  expect(MARKDOWN_HELP).toContain("at the **start of a line**");
});

test("the saved .cfg welcome template has navigable Rules and Server info pages", () => {
  const source = readFileSync("docs/welcome-stages.cfg", "utf8");
  const content = parseCommandMarkdown(source);
  expect(content.map((response) => response.stage)).toEqual([0, 1, 2]);
  expect(content[0].buttons).toMatchObject([
    { label: "View rules", action: "go", target: 1 },
    { label: "Server info", action: "go", target: 2 },
    { label: "Close", action: "cancel" },
  ]);
  expect(content[1].type === "EMBED" && content[1].embed.description).toContain(
    "<#123456789012345678>",
  );
});

test("the syntax guide's copyable example remains valid", () => {
  const guide = readFileSync("docs/custom-commands.md", "utf8");
  const example = /<!-- prettier-ignore -->\n```text\n([\s\S]*?)\n```/.exec(
    guide,
  )?.[1];
  expect(example).toBeDefined();
  expect(parseCommandMarkdown(example!)).toHaveLength(2);
});

test("@channel mentions a chosen channel in text, descriptions and fields", async () => {
  const id = "123456789012345678";
  const text = parseCommandMarkdown(`:::text\nSee:\n@channel ${id}\n:::`);
  expect(text).toEqual([{ type: "TEXT", text: `See:\n<#${id}>` }]);
  const embed = parseCommandMarkdown(
    `:::embed\n@title Rules\nRead:\n@channel <#${id}>\n@field More\n@channel ${id}\n@endfield\n:::`,
  );
  expect(embed).toMatchObject([
    {
      type: "EMBED",
      embed: {
        description: `Read:\n<#${id}>`,
        fields: [{ name: "More", value: `<#${id}>` }],
      },
    },
  ]);
  expect(parseCommandMarkdown(serializeCommandMarkdown(embed))).toEqual(embed);
  const [payload] = await new CustomCommandRenderer().render(
    context({ command: record({ content: embed, responseType: "EMBED" }) }),
  );
  expect(JSON.stringify(payload.embeds?.[0])).toContain(`<#${id}>`);
});

test.each([
  "@channel rules",
  "@channel #rules",
  "@channel 123",
  "@channel <#123456789012345678",
  "@channel 123456789012345678>",
  "@channel 123456789012345678 extra",
])("@channel rejects malformed IDs: %s", (source) => {
  expect(() => parseCommandMarkdown(`:::text\n${source}\n:::`)).toThrow(
    "Discord channel ID",
  );
});

test("plain Markdown and code fences retain formatting; escaped directives stay literal", () => {
  const text = "# Heading\n**bold** _italic_ ||spoiler||\n- item\n> quote";
  expect(parseCommandMarkdown(text)).toEqual([{ type: "TEXT", text }]);
  const code = "```md\n@cover not-a-url\n:::\n```";
  expect(
    parseCommandMarkdown(`:::text\n${code}\n\\@button literal\n:::`),
  ).toEqual([{ type: "TEXT", text: `${code}\n@button literal` }]);
  expect(parseCommandMarkdown("~~~\n@cover literal\n~~~")).toEqual([
    { type: "TEXT", text: "~~~\n@cover literal\n~~~" },
  ]);
});

test("all supported existing response properties survive Markdown download and reload", () => {
  const responses = validator.responses([
    {
      type: "TEXT",
      text: "\n # Markdown\n@literal\n:::embed\n\\backslash\n```\n@code\n```\n",
      buttons: [
        { label: "[Rules] \\ {user.name}", url: "https://example.com/a(b)" },
      ],
    },
    {
      type: "EMBED",
      embed: {
        title: '"Quoted"\nTitle',
        description: " Description\n\n",
        url: "https://example.com/title",
        color: 0,
        image: { url: "{guild.banner}" },
        thumbnail: { url: "{member.avatar}" },
        author: {
          name: "Author",
          url: "https://example.com/author",
          icon_url: "{user.avatar}",
        },
        footer: { text: " Footer ", icon_url: "{guild.icon}" },
        timestamp: false,
        fields: [
          { name: "Field\nName", value: "@literal\nvalue\n", inline: false },
          { name: "Other", value: "**value**", inline: true },
        ],
      },
    },
  ]);
  expect(parseCommandMarkdown(serializeCommandMarkdown(responses))).toEqual(
    responses,
  );
});

test.each([
  "",
  ":::embed\n@cover https://example.com/a",
  ":::text\nhello\n:::embed\nworld\n:::",
  ":::embed\n@unknown value\n:::",
  ":::embed\n@color red\n:::",
  ":::embed\n@title One\n@title Two\n:::",
  ":::embed\n@field Missing end\nvalue\n:::",
  ":::text\n@cover https://example.com/a\n:::",
  ":::embed\n@title Test\n@endfield\n:::",
  ":::embed\n@title Test\n@inline true\n:::",
  ":::embed\n@title Test\n@author-icon https://example.com/a\n:::",
  ":::embed\n@title Test\n@button malformed\n:::",
  ":::embed\n@title Test\n@button [Bad](javascript:alert(1))\n:::",
  ':::embed\n@title "unterminated\n:::',
  ":::text\n{process.env.TOKEN}\n:::",
  ":::text\n```\nUnclosed\n:::",
  ":::embed\n@field F\nvalue\n@title Bad\n:::",
])("malformed source cannot become a saved response: %s", (source) => {
  expect(() => parseCommandMarkdown(source)).toThrow();
});

test("message, button, URL, label and input limits are checked", async () => {
  expect(() => parseCommandMarkdown(":::text\nHi\n:::\n".repeat(6))).toThrow(
    "5 messages",
  );
  expect(() =>
    parseCommandMarkdown(
      "Hi\n" + "@button [Go](https://example.com)\n".repeat(6),
    ),
  ).toThrow("5 buttons");
  expect(() =>
    parseCommandMarkdown(
      `Hi\n@button [${"x".repeat(81)}](https://example.com)`,
    ),
  ).toThrow("80");
  expect(() =>
    parseCommandMarkdown(
      `Hi\n@button [Go](https://example.com/${"x".repeat(512)})`,
    ),
  ).toThrow("512");
  expect(() => parseCommandMarkdown("x".repeat(48001))).toThrow("48000");
  for (const url of [
    "https://user:pass@example.com",
    "http://example.com",
    "https://example.com/{args}",
  ])
    expect(() => parseCommandMarkdown(`Hi\n@button [Go](${url})`)).toThrow();
  const patch = markdownPatch("Hi\n@button [{args}](https://example.com)");
  await expect(
    new CustomCommandRenderer().render(
      context({ command: record(patch), args: ["x".repeat(81)] }),
    ),
  ).rejects.toThrow("80");
});

test("Markdown responses persist, export, import and render through the normal service", async () => {
  const service = new CustomCommandService(new MemoryRepository());
  await service.createCommand(
    "guild-a",
    "admin",
    definition({ description: "Keep settings", cooldownSeconds: 20 }),
  );
  const saved = await service.updateCommand(
    "guild-a",
    "admin",
    "welcome",
    markdownPatch(
      ":::embed\n@title Hello {user.name}\n@cover https://example.com/cover.png\n@button [Rules](https://example.com/rules)\n:::",
    ),
  );
  expect(saved.cooldownSeconds).toBe(20);
  expect(saved.description).toBe("Keep settings");
  const exported = await service.exportCommands("guild-a");
  await service.importCommands("guild-b", "admin", exported);
  const loaded = await service.getCommand("guild-b", "welcome");
  expect(loaded!.content).toEqual(saved.content);
  expect(
    (await new CustomCommandRenderer().render(context({ command: loaded! })))[0]
      .components,
  ).toHaveLength(1);
});

test("ordinary Markdown escapes remain intact outside template directives", () => {
  const text = "\\*not bold*\n\\#not a heading\n\\[not a link]";
  expect(parseCommandMarkdown(text)).toEqual([{ type: "TEXT", text }]);
  expect(
    parseCommandMarkdown(serializeCommandMarkdown([{ type: "TEXT", text }])),
  ).toEqual([{ type: "TEXT", text }]);
});

test("stages, button variants and named/short hex colors round-trip", async () => {
  const source = `
@main
@title Start
@color Blurple
@button primary [Next](Go(stage(2)))
@button danger [Close](Cancle)
@stage(2)
@title Details
@color #abc
@button secondary [Back](Back(stage(0)))
@button success [Home](Main)
`.trim();
  const content = parseCommandMarkdown(source);
  expect(content[0]).toMatchObject({ stage: 0, embed: { color: 0x5865f2 } });
  expect(content[1]).toMatchObject({ stage: 2, embed: { color: 0xaabbcc } });
  expect(parseCommandMarkdown(serializeCommandMarkdown(content))).toEqual(
    content,
  );
  const ctx = context({ command: record({ content, responseType: "MULTI" }) });
  const renderer = new CustomCommandRenderer();
  expect(await renderer.render(ctx)).toHaveLength(1);
  const payloads = await renderer.render(ctx, true);
  const rows = payloads.map((p) => JSON.parse(JSON.stringify(p.components)));
  expect(rows[0][0].components).toMatchObject([
    { style: 1, custom_id: "cc-stage:0:0" },
    { style: 4 },
  ]);
  expect(rows[1][0].components).toMatchObject([{ style: 2 }, { style: 3 }]);
  expect(parseCommandMarkdown("\n@main\nHello")).toEqual([
    { type: "EMBED", stage: 0, embed: { description: "Hello" } },
  ]);
});

test.each([
  "@main\nHello\n@stage(0)\nBad",
  "@main\nHello\n@stage(1)\nOne\n@stage(1)\nDuplicate",
  "@stage(1)\nNo main",
  "@main\nHi\n@button [Next](Go(stage(9)))",
  "Hi\n@button [Close](Cancel)",
  "@main\nHi\n@button link [Close](Cancel)",
  "Hi\n@button danger [Site](https://example.com)",
  "@main\nHi\n@button [Next](Go(stage(-1)))",
  ":::embed\n@main\nHello\n:::\n:::text\nUnmarked\n:::",
])("invalid stages and actions are rejected: %s", (source) => {
  expect(() => parseCommandMarkdown(source)).toThrow();
});

test("stage syntax in code and escaped text remains literal", () => {
  expect(
    parseCommandMarkdown(":::text\n\\@main\n```\n@stage(1)\n```\n:::"),
  ).toEqual([{ type: "TEXT", text: "@main\n```\n@stage(1)\n```" }]);
});

test("staged templates survive service export/import", async () => {
  const service = new CustomCommandService(new MemoryRepository());
  const patch = markdownPatch(
    "@main\nHello\n@button success [Next](Go(stage(1)))\n@stage(1)\nDone\n@button danger [Close](Cancel)",
  );
  await service.createCommand("guild-a", "admin", definition(patch));
  await service.importCommands(
    "guild-b",
    "admin",
    await service.exportCommands("guild-a"),
  );
  expect((await service.getCommand("guild-b", "welcome"))!.content).toEqual(
    patch.content,
  );
});

test("shorthand stages preserve block markers inside code fences", () => {
  expect(
    parseCommandMarkdown("@main\n```md\n:::embed\n@stage(9)\n```"),
  ).toEqual([
    {
      type: "EMBED",
      stage: 0,
      embed: { description: "```md\n:::embed\n@stage(9)\n```" },
    },
  ]);
});

test.each([
  { action: "go", target: -1 },
  { action: "go", target: 1.5 },
  { action: "go", target: "1" },
  { action: "go" },
  { action: "cancel", target: 0 },
  { action: "main", style: "purple" },
  { action: "cancel", url: "https://example.com" },
])("JSON imports also validate action buttons: %j", (button) => {
  expect(() =>
    validator.responses([
      {
        type: "TEXT",
        text: "Hi",
        stage: 0,
        buttons: [{ label: "Go", ...button }],
      },
    ]),
  ).toThrow();
});
