import { expect, test, vi } from "vitest";
vi.mock("../../../src/adapters/logging/runtime.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));
import {
  parseCommandMarkdown,
  serializeCommandMarkdown,
  markdownPatch,
  MARKDOWN_HELP,
} from "../../../src/modules/custom-commands/discord/markdown.js";
import { CustomCommandRenderer } from "../../../src/modules/custom-commands/discord/CustomCommandRenderer.js";
import { CustomCommandValidator } from "../../../src/modules/custom-commands/domain/CustomCommandValidator.js";
import { CustomCommandService } from "../../../src/modules/custom-commands/application/CustomCommandService.js";
import { validateGuildReferences } from "../../../src/modules/custom-commands/discord/CustomCommandGuildValidator.js";
import { hasServerRestrictions } from "../../../src/modules/custom-commands/application/CommandSharingService.js";
import {
  context,
  record,
  definition,
  MemoryRepository,
  ROLE,
} from "./fixtures.js";
import type { Guild } from "discord.js";

const source = `@main
Choose your roles, {user.name}.
@button success [Join](SetRole(${ROLE}))
@button danger [Leave](RemoveRole(${ROLE}))
@button secondary [Toggle](ToggleRole(${ROLE}))
@dropdown Choose an action for {user.name}
@option [Join \\[group\\]](AddRole(${ROLE}))
@option-description Get access to the group
@option [Rules](Go(stage(1)))
@option [Close](Cancel)
@endselect
@stage(1)
Rules
@select Navigate
@option [Back](Back(stage(0)))
@option [Home](Main)
@endselect`;

test("role buttons and dropdowns parse, round-trip and render with Discord limits", async () => {
  const patch = markdownPatch(source);
  expect(parseCommandMarkdown(serializeCommandMarkdown(patch.content))).toEqual(
    patch.content,
  );
  expect(patch.content[0].buttons).toMatchObject([
    { action: "addrole", roleId: ROLE },
    { action: "removerole", roleId: ROLE },
    { action: "togglerole", roleId: ROLE },
  ]);
  const payloads = await new CustomCommandRenderer().render(
    context({ command: record(patch) }),
    true,
  );
  const rows = JSON.parse(JSON.stringify(payloads[0].components));
  expect(rows).toHaveLength(2);
  expect(rows[1].components[0]).toMatchObject({
    type: 3,
    custom_id: "cc-select:0:0",
    placeholder: "Choose an action for Alex",
    min_values: 1,
    max_values: 1,
    options: [
      {
        label: "Join [group]",
        value: "0",
        description: "Get access to the group",
      },
      { label: "Rules", value: "1" },
      { label: "Close", value: "2" },
    ],
  });
  expect(MARKDOWN_HELP.length).toBeLessThanOrEqual(2000);
});

test("role components work on unstaged messages and preserve JSON export/import", async () => {
  const patch = markdownPatch(
    `Choose a role\n@button [Join](SetRole(${ROLE}))\n@select Roles\n@option [Toggle](ToggleRole(${ROLE}))\n@endselect`,
  );
  const service = new CustomCommandService(new MemoryRepository());
  await service.createCommand("guild-a", "admin", definition(patch));
  await service.importCommands(
    "guild-b",
    "admin",
    await service.exportCommands("guild-a"),
  );
  expect((await service.getCommand("guild-b", "welcome"))!.content).toEqual(
    patch.content,
  );
  const [payload] = await new CustomCommandRenderer().render(
    context({ command: record(patch) }),
  );
  expect(
    JSON.parse(JSON.stringify(payload.components))[0].components[0].custom_id,
  ).toBe("cc-response:0:0");
});

test.each([
  `@select Roles\n@endselect`,
  `@select Roles\n@option [Join](AddRole(${ROLE}))`,
  `@option [Join](AddRole(${ROLE}))`,
  `@endselect`,
  `@select Roles\n@option [Site](https://example.com)\n@endselect`,
  `@select Roles\n@option [Join](SetRole(123))\n@endselect`,
  `@select Roles\n@option [Rules](Go(stage(99)))\n@endselect`,
  `@select Roles\n@button [Join](SetRole(${ROLE}))\n@endselect`,
  `@select Roles\n@option-description No option\n@endselect`,
  `@select Roles\n@option [Join](SetRole(${ROLE}))\n@option-description A\n@option-description B\n@endselect`,
  `@select Roles\n@option [Join](SetRole(${ROLE}))\n@stage(1)\n@endselect`,
  `@select Roles\nUnexpected text\n@endselect`,
  `@button [Join](SetRole({args.0}))`,
])("malformed component syntax fails before saving: %s", (directives) => {
  expect(() => parseCommandMarkdown(`@main\nHello\n${directives}`)).toThrow();
});

const option = { label: "Join", action: "addrole", roleId: ROLE };
const select = { placeholder: "Roles", options: [option] };
test.each([
  { buttons: [{ ...option, roleId: "123" }] },
  { buttons: [{ ...option, target: 0 }] },
  { buttons: [{ label: "Go", action: "go", target: 0, roleId: ROLE }] },
  { buttons: [{ label: "Link", url: "https://example.com", roleId: ROLE }] },
  { selects: [{ ...select, options: [] }] },
  { selects: [{ ...select, options: Array(26).fill(option) }] },
  { selects: [{ ...select, maxValues: 2 }] },
  { selects: [{ ...select, options: [{ ...option, value: ROLE }] }] },
  { selects: [{ ...select, placeholder: "x".repeat(151) }] },
  {
    selects: [{ ...select, options: [{ ...option, label: "x".repeat(101) }] }],
  },
  {
    selects: [
      { ...select, options: [{ ...option, description: "x".repeat(101) }] },
    ],
  },
  { selects: [{ ...select, options: [{ ...option, label: "a\nb" }] }] },
  { selects: [{ ...select, options: [{ ...option, label: "{unknown}" }] }] },
  { selects: Array(6).fill(select) },
  { buttons: [option], selects: Array(5).fill(select) },
])(
  "JSON validation rejects invalid or oversized components: %j",
  (components) => {
    expect(() =>
      new CustomCommandValidator().responses([
        { type: "TEXT", text: "Hi", stage: 0, ...components },
      ]),
    ).toThrow();
  },
);

test("five select rows and 25 options are allowed; expanded text is validated", async () => {
  const content = new CustomCommandValidator().responses([
    {
      type: "TEXT",
      text: "Hi",
      selects: Array(5).fill({ ...select, options: Array(25).fill(option) }),
    },
  ]);
  expect(
    (
      await new CustomCommandRenderer().render(
        context({ command: record({ content }) }),
      )
    )[0].components,
  ).toHaveLength(5);
  for (const property of ["label", "description"] as const) {
    const patch = {
      content: [
        {
          type: "TEXT" as const,
          text: "Hi",
          selects: [
            {
              ...select,
              options: [
                { ...option, action: "addrole" as const, [property]: "{args}" },
              ],
            },
          ],
        },
      ],
    };
    await expect(
      new CustomCommandRenderer().render(
        context({ command: record(patch), args: ["x".repeat(101)] }),
      ),
    ).rejects.toThrow("100");
  }
  const patch = markdownPatch(
    `Hi\n@select {args}\n@option [Join](SetRole(${ROLE}))\n@endselect`,
  );
  await expect(
    new CustomCommandRenderer().render(
      context({ command: record(patch), args: ["x".repeat(151)] }),
    ),
  ).rejects.toThrow("150");
});

test("guild validation refreshes role references in buttons and selects, rejecting missing and managed roles", async () => {
  const guild = {
    id: "guild-a",
    roles: { fetch: vi.fn(), cache: new Map([[ROLE, { managed: false }]]) },
    channels: { fetch: vi.fn(), cache: new Map() },
  };
  const command = definition(markdownPatch(source));
  await validateGuildReferences(guild as unknown as Guild, [command]);
  expect(guild.roles.fetch).toHaveBeenCalledOnce();
  guild.roles.cache.set(ROLE, { managed: true });
  await expect(
    validateGuildReferences(guild as unknown as Guild, [command]),
  ).rejects.toThrow("managed");
  guild.roles.cache.clear();
  await expect(
    validateGuildReferences(guild as unknown as Guild, [command]),
  ).rejects.toThrow("does not belong");
  guild.id = ROLE;
  guild.roles.cache.set(ROLE, { managed: false });
  await expect(
    validateGuildReferences(guild as unknown as Guild, [command]),
  ).rejects.toThrow("@everyone");
  expect(hasServerRestrictions(record(markdownPatch(source)))).toBe(true);
  expect(
    hasServerRestrictions(
      record(
        markdownPatch(
          `Hi\n@select Roles\n@option [Join](SetRole(${ROLE}))\n@endselect`,
        ),
      ),
    ),
  ).toBe(true);
  expect(
    hasServerRestrictions(
      record(
        markdownPatch(
          "@main\nHi\n@select Pages\n@option [Home](Main)\n@endselect",
        ),
      ),
    ),
  ).toBe(false);
});
