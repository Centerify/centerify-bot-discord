import { PermissionFlagsBits, type PermissionsString } from "discord.js";
import {
  CUSTOM_COMMAND_LIMITS as L,
  COOLDOWN_SCOPES,
  RESTRICTION_KEYS,
  RESPONSE_TYPES,
  TRIGGER_TYPES,
} from "../../lib/customCommands/constants.js";
import { CustomCommandValidationError } from "../../lib/customCommands/errors.js";
import type {
  CustomCommandDefinition,
  EmbedTemplate,
  ResponseTemplate,
} from "../../lib/customCommands/types.js";
import { CustomCommandVariableResolver } from "./CustomCommandVariableResolver.js";

export function normalizeCommandName(name: string): string {
  return name.trim().toLowerCase();
}
function fail(message: string): never {
  throw new CustomCommandValidationError(message);
}
export function object(
  value: unknown,
  label: string,
  keys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail(`${label} must be an object.`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !keys.includes(key)))
    fail(`${label} contains unsupported fields.`);
  return record;
}
function defaultValue(value: unknown, fallback: unknown): unknown {
  return value === undefined ? fallback : value;
}
function text(
  value: unknown,
  label: string,
  max: number,
  empty = false,
): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!empty && !value.trim())
  )
    return fail(
      `${label} must contain ${empty ? "0" : "1"}–${max} characters.`,
    );
  if (
    value.includes("\0") ||
    Buffer.from(value, "utf8").toString("utf8") !== value
  )
    fail(`${label} contains invalid Unicode or a null character.`);
  return value;
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") return fail(`${label} must be a boolean.`);
  return value;
}
function choice<T extends string>(
  value: unknown,
  choices: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !choices.includes(value as T))
    return fail(`${label} is unsupported.`);
  return value as T;
}
function url(value: unknown): string {
  const input = text(value, "URL", L.url);
  try {
    const parsed = new URL(input);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      /[{}]/.test(input)
    )
      fail("URLs must use HTTPS without credentials or variables.");
  } catch {
    fail("URLs must use HTTPS without credentials or variables.");
  }
  return input;
}
const definitionKeys = [
  "name",
  "description",
  "enabled",
  "triggerType",
  "responseType",
  "content",
  "aliases",
  ...RESTRICTION_KEYS,
  "cooldownSeconds",
  "cooldownScope",
  "deleteInvocation",
  "replyToInvocation",
];
export class CustomCommandValidator {
  public constructor(
    public readonly variables = new CustomCommandVariableResolver(),
  ) {}
  public name(input: unknown): string {
    const name = normalizeCommandName(text(input, "Name", L.name));
    if (!/^[\p{L}\p{N}_-][\p{L}\p{N}\p{M}_-]*$/u.test(name))
      fail(
        "Name must contain letters, numbers, marks, underscores or hyphens, without spaces.",
      );
    return name;
  }
  public definition(input: unknown): CustomCommandDefinition {
    const data = object(input, "Command", definitionKeys);
    const name = this.name(data.name);
    const aliases = this.list(
      defaultValue(data.aliases, []),
      "Aliases",
      L.aliases,
    ).map((alias) => this.name(alias));
    if (new Set([name, ...aliases]).size !== aliases.length + 1)
      fail("Names and aliases must be distinct.");
    const restrictions = Object.fromEntries(
      RESTRICTION_KEYS.map((key) => {
        const values = this.list(
          defaultValue(data[key], []),
          key,
          L.restrictions,
        );
        if (key.endsWith("Permissions")) {
          for (const permission of values)
            if (!Object.hasOwn(PermissionFlagsBits, permission))
              fail(`Unknown Discord permission: ${permission}.`);
        } else
          for (const id of values)
            if (!/^\d{17,20}$/.test(id))
              fail(`${key} must contain Discord IDs.`);
        return [key, values];
      }),
    ) as Pick<CustomCommandDefinition, (typeof RESTRICTION_KEYS)[number]>;
    const cooldownSeconds = defaultValue(data.cooldownSeconds, 0);
    if (
      typeof cooldownSeconds !== "number" ||
      !Number.isInteger(cooldownSeconds) ||
      cooldownSeconds < 0 ||
      cooldownSeconds > L.cooldownSeconds
    )
      fail(`Cooldown must be 0–${L.cooldownSeconds} seconds.`);
    const content = this.responses(data.content);
    const responseType = choice(
      defaultValue(
        data.responseType,
        content.length > 1 ? "MULTI" : content[0]!.type,
      ),
      RESPONSE_TYPES,
      "Response type",
    );
    if (
      responseType !== "MULTI" &&
      (content.length !== 1 || content[0]!.type !== responseType)
    )
      fail("Response type does not match its content.");
    return {
      name,
      aliases,
      ...restrictions,
      content,
      responseType,
      description: text(
        defaultValue(data.description, ""),
        "Description",
        L.description,
        true,
      ),
      enabled: boolean(defaultValue(data.enabled, true), "Enabled"),
      triggerType: choice(
        defaultValue(data.triggerType, "BOTH"),
        TRIGGER_TYPES,
        "Trigger type",
      ),
      cooldownSeconds,
      cooldownScope: choice(
        defaultValue(data.cooldownScope, "USER"),
        COOLDOWN_SCOPES,
        "Cooldown scope",
      ),
      deleteInvocation: boolean(
        defaultValue(data.deleteInvocation, false),
        "Delete invocation",
      ),
      replyToInvocation: boolean(
        defaultValue(data.replyToInvocation, true),
        "Reply to invocation",
      ),
    };
  }
  private list(value: unknown, label: string, max: number): string[] {
    if (
      !Array.isArray(value) ||
      value.length > max ||
      value.some((entry) => typeof entry !== "string" || entry.length > L.name)
    )
      return fail(`${label} must be a list of at most ${max} strings.`);
    const values = value as string[];
    if (new Set(values).size !== values.length)
      fail(`${label} contains duplicates.`);
    return [...values];
  }
  public responses(input: unknown, templates = true): ResponseTemplate[] {
    if (!Array.isArray(input) || input.length < 1 || input.length > L.messages)
      return fail(`Provide 1–${L.messages} response messages.`);
    if (JSON.stringify(input).length > L.templateInput)
      fail("Response payload is too large.");
    return Array.from(input).map((entry) => {
      const data = object(entry, "Response", ["type", "text", "embed"]);
      if (data.type === "TEXT") {
        if (data.embed !== undefined)
          fail("Text responses cannot contain an embed.");
        const value = text(data.text, "Response text", L.text);
        if (templates) this.variables.validate(value);
        return { type: "TEXT", text: value };
      }
      if (data.type !== "EMBED" || data.text !== undefined)
        return fail("Unsupported response type.");
      return { type: "EMBED", embed: this.embed(data.embed, templates) };
    });
  }
  public embed(input: unknown, templates = true): EmbedTemplate {
    const data = object(input, "Embed", [
      "title",
      "description",
      "url",
      "color",
      "author",
      "footer",
      "thumbnail",
      "image",
      "timestamp",
      "fields",
    ]);
    let total = 0;
    const checkedText = (value: unknown, label: string, max: number) => {
      const result = text(value, label, max);
      total += result.length;
      if (templates) this.variables.validate(result);
      return result;
    };
    const result: EmbedTemplate = {};
    if (data.title !== undefined)
      result.title = checkedText(data.title, "Embed title", L.embedTitle);
    if (data.description !== undefined)
      result.description = checkedText(
        data.description,
        "Embed description",
        L.embedDescription,
      );
    if (data.url !== undefined) result.url = url(data.url);
    if (data.color !== undefined) {
      if (
        typeof data.color !== "number" ||
        !Number.isInteger(data.color) ||
        data.color < 0 ||
        data.color > 0xffffff
      )
        fail("Embed color must be an integer from 0 to 16777215.");
      result.color = data.color;
    }
    if (data.author !== undefined) {
      const author = object(data.author, "Embed author", [
        "name",
        "url",
        "icon_url",
      ]);
      result.author = {
        name: checkedText(author.name, "Author name", L.embedAuthor),
        ...(author.url !== undefined ? { url: url(author.url) } : {}),
        ...(author.icon_url !== undefined
          ? { icon_url: url(author.icon_url) }
          : {}),
      };
    }
    if (data.footer !== undefined) {
      const footer = object(data.footer, "Embed footer", ["text", "icon_url"]);
      result.footer = {
        text: checkedText(footer.text, "Footer", L.embedFooter),
        ...(footer.icon_url !== undefined
          ? { icon_url: url(footer.icon_url) }
          : {}),
      };
    }
    for (const key of ["thumbnail", "image"] as const)
      if (data[key] !== undefined) {
        const image = object(data[key], key, ["url"]);
        result[key] = { url: url(image.url) };
      }
    if (data.timestamp !== undefined) {
      if (typeof data.timestamp === "boolean")
        result.timestamp = data.timestamp;
      else if (
        typeof data.timestamp === "string" &&
        /^\d{4}-\d{2}-\d{2}T/.test(data.timestamp) &&
        Number.isFinite(Date.parse(data.timestamp))
      )
        result.timestamp = new Date(data.timestamp).toISOString();
      else fail("Timestamp must be a boolean or an ISO date.");
    }
    if (data.fields !== undefined) {
      if (!Array.isArray(data.fields) || data.fields.length > L.embedFields)
        fail(`Embeds support at most ${L.embedFields} fields.`);
      result.fields = data.fields.map((field) => {
        const item = object(field, "Embed field", ["name", "value", "inline"]);
        return {
          name: checkedText(item.name, "Field name", L.embedFieldName),
          value: checkedText(item.value, "Field value", L.embedFieldValue),
          ...(item.inline !== undefined
            ? { inline: boolean(item.inline, "Inline") }
            : {}),
        };
      });
    }
    if (total > L.embedTotal)
      fail(`Embed text must be at most ${L.embedTotal} characters in total.`);
    if (!total && !result.image && !result.thumbnail)
      fail("Embed needs text or an image.");
    return result;
  }
}
export function isPermission(value: string): value is PermissionsString {
  return Object.hasOwn(PermissionFlagsBits, value);
}
