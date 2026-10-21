import { expect, test } from "vitest";
import { parseCommandMarkdown } from "../../../src/modules/custom-commands/discord/markdown.js";
import { templateTokens } from "../../../src/modules/custom-commands/domain/variables.js";
import { CustomCommandService } from "../../../src/modules/custom-commands/application/CustomCommandService.js";
import { definition, MemoryRepository, USER } from "./fixtures.js";

test.each([
  ['Hello\n@button [Rename](SetChannelName("{channel.id}"))', "Markdown line 2", "Channel name"],
  ['@main\nHello\n@button [Slow](SetSlowmode("{channel.id}", -1))', "Markdown line 3", "Slowmode"],
  [
    'Hello\n@button [Bad](SetChanelName("{channel.id}", "name"))',
    "Markdown line 2",
    "unknown or malformed action",
  ],
  ["Hello\n@button [Bad](SetRole(123))", "Markdown line 2", "Discord role ID"],
  ['Hello\n@button [Bad](SetChannelTopic("{channel.id}", unquoted))', "Markdown line 2", "JSON"],
  [
    'Hello\n@button [Bad](SetSlowmode("{channel.id}", 1, 2))',
    "Markdown line 2",
    "Too many arguments",
  ],
  [
    '@main\nHello\n@select Choose\n@option [Bad](SetChannelName("{channel.id}", "{missing}"))\n@endselect',
    "Markdown line 4",
    "Unknown variable",
  ],
  ["@main\nHello\n@title {missing}", "Markdown line 3", "Unknown variable"],
  ["@main\nHello\nBad {user.name", "Markdown line 3", "Unmatched template brace"],
  ["@main\nHello\n@button [{missing}](Cancel)", "Markdown line 3", "Unknown variable"],
])("invalid syntax includes the source line: %s", (source, location, reason) => {
  expect(() => parseCommandMarkdown(source)).toThrow(location);
  expect(() => parseCommandMarkdown(source)).toThrow(reason);
});

test("placeholder diagnostics include the exact line and column", () => {
  expect(() => templateTokens("Hello\nSay {missing}")).toThrow("line 2, column 5");
  expect(() => templateTokens("Hello\nSay }")).toThrow("line 2, column 5");
  expect(() => templateTokens("Hello {{user.name}}")).toThrow("Nested placeholders");
});

test("invalid channel actions leave a saved command intact", async () => {
  const repository = new MemoryRepository();
  const service = new CustomCommandService(repository);
  await service.createCommand("guild-a", USER, definition());
  const before = await service.getCommand("guild-a", "welcome");
  await expect(
    service.updateCommand("guild-a", USER, "welcome", {
      content: [
        {
          type: "TEXT",
          text: "Hello",
          buttons: [
            {
              label: "Slow",
              action: "setslowmode",
              channelId: "{channel.id}",
              seconds: 21601,
            },
          ],
        },
      ],
    }),
  ).rejects.toThrow("Slowmode");
  expect(await service.getCommand("guild-a", "welcome")).toEqual(before);
});
