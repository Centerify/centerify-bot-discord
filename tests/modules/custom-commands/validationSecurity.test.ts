import { expect, test } from "vitest";
import {
  object,
  text,
  boolean,
  choice,
} from "../../../src/modules/custom-commands/domain/validation.js";
import { CustomCommandValidationError } from "../../../src/modules/custom-commands/domain/errors.js";
import { CustomCommandValidator } from "../../../src/modules/custom-commands/domain/CustomCommandValidator.js";

test.each([null, [], "text", 1, Object.create({ enabled: true })])(
  "strict object validation rejects malformed and inherited data: %s",
  (input) => {
    expect(() => object(input, "Command", ["enabled"])).toThrow(CustomCommandValidationError);
  },
);
test.each(["__proto__", "constructor", "prototype", "unexpected"])(
  "imported objects reject unsupported key %s without modifying prototypes",
  (key) => {
    const input = JSON.parse(`{"${key}": {"polluted": true}}`);
    expect(() => object(input, "Command", ["name"])).toThrow("unsupported fields");
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
  },
);
test("validating supported fields produces an independent object, including null-prototype inputs", () => {
  const input = Object.assign(Object.create(null), { name: "hello" });
  const result = object(input, "Command", ["name", "optional"]);
  expect(result).toEqual({ name: "hello" });
  expect(result).not.toBe(input);
});
test.each(["\0", "\ud800", "\udfff", "    ", "123456"])(
  "bounded text rejects invalid Unicode, blank or oversized text: %s",
  (input) => {
    expect(() => text(input, "Text", 5)).toThrow(CustomCommandValidationError);
  },
);
test("package validation preserves permitted Unicode, optional text and strict primitive types", () => {
  expect(text("سلام", "Text", 5)).toBe("سلام");
  expect(text("", "Text", 5, true)).toBe("");
  expect(boolean(false, "Enabled")).toBe(false);
  expect(() => boolean("false", "Enabled")).toThrow("must be a boolean");
  expect(choice("TEXT", ["TEXT", "EMBED"], "Type")).toBe("TEXT");
  expect(() => choice("text", ["TEXT", "EMBED"], "Type")).toThrow("unsupported");
});
test("nested command payloads use strict validation too", () => {
  const content = [
    {
      type: "TEXT",
      text: "hello",
      buttons: [{ label: "Link", url: "https://example.com", injected: true }],
    },
  ];
  expect(() => new CustomCommandValidator().definition({ name: "hello", content })).toThrow(
    CustomCommandValidationError,
  );
});

test("Zod validation preserves UTF-16 length limits for emoji", () => {
  expect(text("😀", "Text", 2)).toBe("😀");
  expect(() => text("😀", "Text", 1)).toThrow(CustomCommandValidationError);
});
