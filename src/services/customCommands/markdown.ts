import { Colors } from "discord.js";
import type {
  EmbedTemplate,
  ResponseTemplate,
} from "../../lib/customCommands/types.js";
import { CUSTOM_COMMAND_LIMITS as L } from "../../lib/customCommands/constants.js";
import { CustomCommandValidationError } from "../../lib/customCommands/errors.js";
import { CustomCommandValidator } from "./CustomCommandValidator.js";

export const MARKDOWN_EXAMPLE = `@main
@title Welcome to {guild.name}!
@color Blurple
@thumbnail {user.avatar}
Hello {user.mention}! Choose an option below.
@button primary [Rules](Go(stage(1)))
@button danger [Close](Cancel)

@stage(1)
@title Server Rules
@color #ed4245
1. Be respectful.
2. No spam or advertising.
3. Keep discussions in the right channels.
@button secondary [Back](Back(stage(0)))
@button danger [Close](Cancel)`;

export const MARKDOWN_HELP = `**Template syntax**
Start with \`@main\` for the first embed. Each \`@stage(n)\` starts another embed. Put directives at the **start of a line**, without indentation. Ordinary lines become the description. The attached example has a Rules page.

**Buttons** (up to five per stage)
\`@button primary [Rules](Go(stage(1)))\` — open page 1
\`@button secondary [Back](Back(stage(0)))\` — open page 0
\`@button success [Home](Main)\` — return to the first page
\`@button danger [Close](Cancel)\` — remove controls
\`@button [Website](https://example.com)\` — open a link
Styles: primary, secondary, success, danger. Links use the link style.

**Embed options**
\`@title Text\` · \`@color Blurple\` or \`@color #5865f2\` · \`@cover URL\` · \`@thumbnail URL\` · \`@footer Text\`
\`@field Name\`, then the value on following lines, then \`@endfield\`. Optional \`@inline true\` goes inside the field.

For plain text, use Discord Markdown. For separate text/embed messages, use \`:::text\` or \`:::embed\` blocks closed by \`:::\`. A staged block needs its own marker. Maximum five messages or stages. Variables work in text and button labels. Saving replaces all responses; command settings stay unchanged.`;

function scalar(input: string, line: number): string {
  const value = input.trim();
  if (!value.startsWith('"')) return value;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "string") return parsed;
  } catch {
    /* Report an actionable source location below. */
  }
  throw new CustomCommandValidationError(
    `Markdown line ${line}: invalid quoted value.`,
  );
}

/** Parse a small declarative dialect. No expressions, HTML or code are executed. */
export function parseCommandMarkdown(source: string): ResponseTemplate[] {
  if (!source.trim() || source.length > L.markdownInput)
    throw new CustomCommandValidationError(
      `Markdown must contain 1–${L.markdownInput} characters.`,
    );
  const lines = source
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const stagedShorthand = /^@(?:main|stage\(\d+\))$/.test(
    lines.find((line) => line.trim()) ?? "",
  );
  const explicit = /^:::(?:text|embed)\s*$/.test(
    lines.find((line) => line.trim()) ?? "",
  );
  let response: ResponseTemplate | undefined =
    explicit || stagedShorthand ? undefined : { type: "TEXT", text: "" };
  let body: string[] = [],
    field: { name: string; value: string; inline?: boolean } | undefined;
  let fieldBody: string[] = [],
    fence: { char: string; length: number } | undefined;
  let seen = new Set<string>();
  const responses: ResponseTemplate[] = [];
  const fail = (line: number, message: string): never => {
    throw new CustomCommandValidationError(`Markdown line ${line}: ${message}`);
  };
  const append = (line: string) => (field ? fieldBody : body).push(line);
  const finish = (line: number) => {
    if (!response) return;
    if (field) fail(line, "close the field with @endfield.");
    const text = body.join("\n");
    if (response.type === "TEXT") response.text = text;
    else if (text.length) response.embed.description = text;
    responses.push(response);
    if (responses.length > L.messages)
      fail(line, `use at most ${L.messages} messages.`);
    response = undefined;
    body = [];
    seen = new Set();
  };
  for (const [index, line] of lines.entries()) {
    const number = index + 1;
    if (fence) {
      append(line);
      if (new RegExp(`^ {0,3}${fence.char}{${fence.length},}\\s*$`).test(line))
        fence = undefined;
      continue;
    }
    const stageMarker = /^@(main|stage\((\d+)\))$/.exec(line);
    if (stageMarker) {
      if (field) fail(number, "close the field before a stage marker.");
      if (stagedShorthand) {
        if (index > 0) finish(number);
        response = { type: "EMBED", embed: {} };
      }
      if (!response)
        fail(number, "place stage markers inside a response block.");
      if (response!.stage !== undefined)
        fail(number, "duplicate stage marker.");
      response!.stage = stageMarker[1] === "main" ? 0 : Number(stageMarker[2]);
      if (stageMarker[1] !== "main" && response!.stage === 0)
        fail(number, "use @main for stage zero.");
      continue;
    }
    if (!response) {
      if (!line.trim()) continue;
      if (line.trimEnd() === ":::text" || line.trimEnd() === ":::embed") {
        response =
          line.trimEnd() === ":::text"
            ? { type: "TEXT", text: "" }
            : { type: "EMBED", embed: {} };
        continue;
      }
      fail(number, "expected :::text or :::embed.");
    }
    if (/^\\(?:@|:::|\\| {0,3}(?:`{3,}|~{3,}))/.test(line)) {
      append(line.slice(1));
      continue;
    }
    const openingFence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (openingFence) {
      fence = { char: openingFence[1][0], length: openingFence[1].length };
      append(line);
      continue;
    }
    if (line.trimEnd() === ":::") {
      if (!explicit)
        fail(number, "use :::text or :::embed before closing a block.");
      finish(number);
      continue;
    }
    if (line.startsWith(":::"))
      fail(number, "close the current block with ::: before starting another.");
    if (!line.startsWith("@")) {
      append(line);
      continue;
    }
    const match = /^@([a-z-]+)(?:\s+(.*))?$/.exec(line);
    if (!match)
      fail(
        number,
        "invalid directive; escape literal @ lines with a backslash.",
      );
    const key = match![1],
      raw = match![2] ?? "";
    if (key === "endfield") {
      if (!field || raw)
        fail(number, "@endfield must close an open field and take no value.");
      field!.value = fieldBody.join("\n");
      field = undefined;
      fieldBody = [];
      continue;
    }
    if (key === "inline") {
      if (!field || !["true", "false"].includes(raw))
        fail(number, "use @inline true or false inside a field.");
      field!.inline = raw === "true";
      continue;
    }
    if (field)
      fail(number, "close the field with @endfield before another directive.");
    if (key === "button") {
      const styled =
        /^(?:(primary|secondary|success|danger|link)\s+)?(.*)$/i.exec(raw)!;
      const style = styled[1]?.toLowerCase();
      const link = /^\[((?:\\.|[^\]\\])*)\]\((.+)\)$/.exec(styled[2]);
      if (!link) fail(number, "use @button [Label](https://example.com).");
      const label = link![1].replace(/\\(.)/g, "$1");
      const target = link![2];
      const navigation = /^(go|back)\(stage\((\d+)\)\)$/i.exec(target);
      const simple = /^(main|cancel|cancle)(?:\(\))?$/i.exec(target);
      if (navigation || simple) {
        if (style === "link") fail(number, "actions cannot use link style.");
        (response!.buttons ??= []).push({
          label,
          action: navigation
            ? (navigation[1].toLowerCase() as "go" | "back")
            : simple![1].toLowerCase() === "main"
              ? "main"
              : "cancel",
          ...(navigation ? { target: Number(navigation[2]) } : {}),
          ...(style
            ? { style: style as "primary" | "secondary" | "success" | "danger" }
            : {}),
        });
      } else {
        if (style && style !== "link")
          fail(number, "URL buttons must use link style.");
        (response!.buttons ??= []).push({ label, url: target });
      }
      continue;
    }
    if (response!.type !== "EMBED")
      fail(number, `@${key} requires an :::embed block.`);
    const embed = (response as { type: "EMBED"; embed: EmbedTemplate }).embed;
    const value = scalar(raw, number);
    if (key === "field") {
      field = { name: value, value: "" };
      fieldBody = [];
      (embed.fields ??= []).push(field);
      continue;
    }
    if (seen.has(key)) fail(number, `duplicate @${key}.`);
    seen.add(key);
    switch (key) {
      case "title":
        embed.title = value;
        break;
      case "url":
        embed.url = value;
        break;
      case "color":
        {
          const named = Object.entries(Colors).find(
            ([name]) => name.toLowerCase() === value.toLowerCase(),
          );
          if (named) embed.color = named[1];
          else if (/^#[\da-f]{6}$/i.test(value))
            embed.color = parseInt(value.slice(1), 16);
          else if (/^#[\da-f]{3}$/i.test(value))
            embed.color = parseInt(
              [...value.slice(1)].map((c) => c + c).join(""),
              16,
            );
          else
            fail(
              number,
              "color must be a Discord color name or hex value, e.g. Blurple or #5865f2.",
            );
        }
        break;
      case "cover":
        embed.image = { url: value };
        break;
      case "thumbnail":
        embed.thumbnail = { url: value };
        break;
      case "author":
        embed.author = { ...embed.author, name: value };
        break;
      case "author-icon":
        embed.author = { name: "", ...embed.author, icon_url: value };
        break;
      case "author-url":
        embed.author = { name: "", ...embed.author, url: value };
        break;
      case "footer":
        embed.footer = { ...embed.footer, text: value };
        break;
      case "footer-icon":
        embed.footer = { text: "", ...embed.footer, icon_url: value };
        break;
      case "timestamp":
        embed.timestamp =
          value === "true" ? true : value === "false" ? false : value;
        break;
      default:
        fail(
          number,
          `unknown directive @${key}. Escape literal @ lines with a backslash.`,
        );
    }
  }
  if (explicit && response) fail(lines.length, "missing closing :::.");
  if (fence) fail(lines.length, "unclosed code fence.");
  finish(lines.length);
  return new CustomCommandValidator().responses(responses);
}

// Canonical source preserves text, metadata, field order and buttons when reopening.
export function serializeCommandMarkdown(content: ResponseTemplate[]): string {
  const quote = (value: string) =>
    /[\r\n]/.test(value) || value.trim() !== value || value.startsWith('"')
      ? JSON.stringify(value)
      : value;
  // Escape syntax even inside code fences so reparsing is independent of their content.
  const body = (value: string) =>
    value
      .split("\n")
      .map((line) =>
        /^(?:@|:::|\\| {0,3}(?:`{3,}|~{3,}))/.test(line) ? `\\${line}` : line,
      )
      .join("\n");
  return content
    .map((response) => {
      const lines = [response.type === "TEXT" ? ":::text" : ":::embed"];
      if (response.stage !== undefined)
        lines.push(
          response.stage === 0 ? "@main" : `@stage(${response.stage})`,
        );
      const add = (key: string, value: string | undefined) => {
        if (value !== undefined) lines.push(`@${key} ${quote(value)}`);
      };
      if (response.type === "TEXT") lines.push(body(response.text));
      else {
        const e = response.embed;
        add("title", e.title);
        add("url", e.url);
        if (e.color !== undefined)
          add("color", `#${e.color.toString(16).padStart(6, "0")}`);
        add("cover", e.image?.url);
        add("thumbnail", e.thumbnail?.url);
        add("author", e.author?.name);
        add("author-icon", e.author?.icon_url);
        add("author-url", e.author?.url);
        add("footer", e.footer?.text);
        add("footer-icon", e.footer?.icon_url);
        if (e.timestamp !== undefined) add("timestamp", String(e.timestamp));
        if (e.description !== undefined) lines.push(body(e.description));
        for (const field of e.fields ?? []) {
          add("field", field.name);
          if (field.inline !== undefined) add("inline", String(field.inline));
          lines.push(body(field.value), "@endfield");
        }
      }
      for (const button of response.buttons ?? []) {
        const target =
          "url" in button
            ? button.url
            : button.action === "go" || button.action === "back"
              ? `${button.action}(stage(${button.target}))`
              : button.action;
        const style =
          "action" in button && button.style ? `${button.style} ` : "";
        lines.push(
          `@button ${style}[${button.label.replace(/[\\\[\]]/g, "\\$&")}](${target})`,
        );
      }
      lines.push(":::");
      return lines.join("\n");
    })
    .join("\n\n");
}

export function markdownPatch(source: string) {
  const content = parseCommandMarkdown(source);
  return {
    content,
    responseType: content.length > 1 ? ("MULTI" as const) : content[0].type,
  };
}
