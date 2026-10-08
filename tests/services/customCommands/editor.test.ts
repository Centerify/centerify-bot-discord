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

test("individual fields can be prefilled, replaced and deleted without losing siblings", () => {
  const initial = record({
    responseType: "EMBED",
    content: [
      {
        type: "EMBED",
        embed: {
          title: "Profile",
          fields: [
            { name: "First", value: "One" },
            { name: "Second", value: "Two", inline: true },
          ],
        },
      },
    ],
  });
  const modal = responseModal(
    "id",
    "edit-field-1",
    initial.content[0],
  ).toJSON();
  expect(JSON.stringify(modal)).toContain('"value":"Second"');
  const content = applyResponseModal(
    initial,
    0,
    "edit-field-1",
    submit({
      name: "Changed",
      value: "{user.name}",
      inline: "false",
      remove: "false",
    }) as never,
  );
  expect(content[0]).toMatchObject({
    embed: {
      fields: [
        { name: "First", value: "One" },
        { name: "Changed", value: "{user.name}", inline: false },
      ],
    },
  });
  expect(
    applyResponseModal(
      initial,
      0,
      "edit-field-0",
      submit({ remove: "true" }) as never,
    )[0],
  ).toMatchObject({ embed: { fields: [{ name: "Second" }] } });
  expect(initial.content[0]).toMatchObject({
    embed: { fields: [{ name: "First" }, { name: "Second" }] },
  });
  expect(() =>
    responseModal("id", "edit-field-20", initial.content[0]),
  ).toThrow("no longer exists");
  const view = editorView(initial, "session", "responses", 0, "allowedRoleIds");
  expect(view.components).toHaveLength(2);
  for (const row of view.components) expect(() => row.toJSON()).not.toThrow();
});

test("embed links preserve media and require author text", () => {
  const initial = record({
    content: [
      {
        type: "EMBED",
        embed: { title: "Title", image: { url: "{user.avatar}" } },
      },
    ],
  });
  expect(() =>
    applyResponseModal(
      initial,
      0,
      "links",
      submit({ author_url: "https://example.com" }) as never,
    ),
  ).toThrow("author text");
  const content = applyResponseModal(
    initial,
    0,
    "links",
    submit({ url: "https://example.com" }) as never,
  );
  expect(new CustomCommandValidator().responses(content)[0]).toMatchObject({
    embed: { url: "https://example.com", image: { url: "{user.avatar}" } },
  });
});
