import { expect, test } from "vitest";
import {
  applyResponseModal,
  editorModal,
  responseModal,
} from "../../../src/services/customCommands/editorResponses.js";
import { editorView } from "../../../src/services/customCommands/editorView.js";
import { CustomCommandValidator } from "../../../src/services/customCommands/CustomCommandValidator.js";
import { record } from "./fixtures.js";
function submit(values: Record<string, string>) {
  return { fields: { getTextInputValue: (key: string) => values[key] ?? "" } };
}
test("text and embed editors serialize valid modals and bounded controls", () => {
  const text = record();
  expect(
    responseModal("id", "response", text.content[0]!).toJSON().components,
  ).toHaveLength(1);
  const embed = record({
    content: [{ type: "EMBED", embed: { title: "Title" } }],
  });
  expect(
    responseModal("id", "response", embed.content[0]!).toJSON().components,
  ).toHaveLength(5);
  expect(
    responseModal("id", "media", embed.content[0]!).toJSON().components,
  ).toHaveLength(5);
  expect(
    responseModal("id", "field", embed.content[0]!).toJSON().components,
  ).toHaveLength(3);
  for (const section of ["responses", "access"] as const) {
    const view = editorView(text, "session", section, 0, "allowedRoleIds");
    expect(view.components.length).toBeLessThanOrEqual(5);
    for (const component of view.components)
      expect(() => component.toJSON()).not.toThrow();
  }
  expect(() =>
    editorModal("id", "Title", [
      { id: "text", label: "Response", max: 2000 },
    ]).toJSON(),
  ).not.toThrow();
});
test("response edits are structured, preserve unrelated fields and never mutate the original", () => {
  const initial = record({
    responseType: "EMBED",
    content: [
      {
        type: "EMBED",
        embed: {
          description: "Old",
          image: { url: "https://example.com/a.png" },
        },
      },
    ],
  });
  const content = applyResponseModal(
    initial,
    0,
    "response",
    submit({
      title: "Hello {user.name}",
      description: "New",
      color: "#5865f2",
      author: "Alex",
      footer: "Footer",
    }) as never,
  );
  expect(new CustomCommandValidator().responses(content)).toMatchObject([
    {
      type: "EMBED",
      embed: {
        title: "Hello {user.name}",
        description: "New",
        color: 0x5865f2,
        image: { url: "https://example.com/a.png" },
      },
    },
  ]);
  expect(initial.content[0]).toMatchObject({ embed: { description: "Old" } });
});
test("media and fields are validated; malformed colors, flags and field overflow fail", () => {
  const initial = record({
    responseType: "EMBED",
    content: [{ type: "EMBED", embed: { title: "Title" } }],
  });
  expect(() =>
    applyResponseModal(
      initial,
      0,
      "response",
      submit({ color: "bad" }) as never,
    ),
  ).toThrow("six-digit");
  expect(() =>
    applyResponseModal(
      initial,
      0,
      "media",
      submit({ author_icon: "https://example.com/a" }) as never,
    ),
  ).toThrow("author text");
  expect(() =>
    applyResponseModal(
      initial,
      0,
      "field",
      submit({ name: "n", value: "v", inline: "maybe" }) as never,
    ),
  ).toThrow("Inline");
  const content = applyResponseModal(
    initial,
    0,
    "field",
    submit({ name: "n", value: "v", inline: "true" }) as never,
  );
  expect(content[0]).toMatchObject({
    embed: { fields: [{ name: "n", value: "v", inline: true }] },
  });
  expect(
    new CustomCommandValidator().responses(
      applyResponseModal(
        initial,
        0,
        "media",
        submit({ image: "https://example.com/a", timestamp: "true" }) as never,
      ),
    ),
  ).toBeDefined();
});
