import { z } from "zod";
import { CustomCommandValidationError } from "./errors.js";

/** Translate package validation into the module's stable, user-safe error API. */
function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new CustomCommandValidationError(result.error.issues[0].message);
  return result.data;
}

export function object(
  value: unknown,
  label: string,
  keys: readonly string[],
): Record<string, unknown> {
  return parse(
    z
      .custom<Record<string, unknown>>(
        (input) => {
          if (!input || typeof input !== "object" || Array.isArray(input)) return false;
          const prototype = Object.getPrototypeOf(input);
          return prototype === Object.prototype || prototype === null;
        },
        { error: `${label} must be an object.`, abort: true },
      )
      .pipe(
        z.strictObject(Object.fromEntries(keys.map((key) => [key, z.unknown().optional()])), {
          error: `${label} contains unsupported fields.`,
        }),
      ),
    value,
  );
}

export function text(value: unknown, label: string, max: number, empty = false): string {
  const message = `${label} must contain ${empty ? "0" : "1"}–${max} characters.`;
  return parse(
    z
      .string({ error: message })
      // Preserve Discord's existing UTF-16 limits, including surrogate pairs.
      .refine((input) => input.length <= max && (empty || Boolean(input.trim())), {
        error: message,
        abort: true,
      })
      .refine(
        (input) => !input.includes("\0") && Buffer.from(input, "utf8").toString("utf8") === input,
        { error: `${label} contains invalid Unicode or a null character.`, abort: true },
      ),
    value,
  );
}

export function boolean(value: unknown, label: string): boolean {
  return parse(z.boolean({ error: `${label} must be a boolean.` }), value);
}

export function choice<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  return parse(z.enum(choices, { error: `${label} is unsupported.` }), value);
}
