import { Colors } from "discord.js";
import type {
  EmbedTemplate,
  ResponseTemplate,
  ComponentAction,
  SelectTemplate,
} from "../domain/types.js";
import { CUSTOM_COMMAND_LIMITS as L } from "../domain/constants.js";
import { CustomCommandValidationError } from "../domain/errors.js";
import {
  CustomCommandValidator,
  object,
  COMPONENT_ACTION_FIELDS,
} from "../domain/CustomCommandValidator.js";
import { parseDuration } from "../../moderation/discord/index.js";

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
Read the full rules in:
@channel 123456789012345678
@button secondary [Back](Back(stage(0)))
@button danger [Close](Cancel)`;

export const MARKDOWN_HELP = `**Template syntax**
Start with \`@main\`; \`@stage(n)\` starts another embed. Directives belong at the **start of a line**, without indentation. Ordinary lines become the description. The example has a Rules page.

**Buttons** (up to five per stage)
\`@button primary [Rules](Go(stage(1)))\` — open page 1
\`@button secondary [Back](Back(stage(0)))\` — open page 0
\`@button success [Home](Main)\` — return to the first page
\`@button danger [Close](Cancel)\` — remove controls
\`@button [Website](https://example.com)\` — open a link
Styles: primary, secondary, success, danger.
\`@button success [Join](SetRole(ROLE_ID))\` — add a role
Also: \`AddRole(ID)\`, \`RemoveRole(ID)\`, \`ToggleRole(ID)\`.
**Dropdowns**: \`@select Choose\`, then \`@option [Rules](Go(stage(1)))\`, then \`@endselect\`.

**Custom actions**
\`@button [Warn](SetWarn("{args.0}", "Reason", "1h"))\`
\`@button [Note](AddNote("{args.0}", "Note"))\`
Also: Unwarn, Timeout, RemoveTimeout, Kick, Ban, Unban, SetNickname, Reply, SendMessage. Quote IDs and text. \`Action({...})\` configures all fields; \`Actions([...])\` runs up to ten steps. Options use the same actions. Preview executes no effects.

**Embed options**
\`@title Text\` · \`@color Blurple\` or \`@color #5865f2\` · \`@cover URL\` · \`@thumbnail URL\` · \`@footer Text\`
\`@field Name\`, then its value, then \`@endfield\`; optional \`@inline true\` goes inside.
\`@channel CHANNEL_ID\` mentions a channel.

Separate messages use \`:::text\` or \`:::embed\` blocks closed by \`:::\`. Maximum five messages or stages. Variables work in labels, action targets and text.`;

function parseAction(value: string): ComponentAction | undefined {
  const navigation = /^(go|back)\(stage\((\d+)\)\)$/i.exec(value);
  if (navigation)
    return {
      action: navigation[1].toLowerCase() as "go" | "back",
      target: Number(navigation[2]),
    };
  const simple = /^(main|cancel|cancle)(?:\(\))?$/i.exec(value);
  if (simple)
    return { action: simple[1].toLowerCase() === "main" ? "main" : "cancel" };
  const role = /^(setrole|addrole|removerole|togglerole)\((\d{17,20})\)$/i.exec(
    value,
  );
  if (role)
    return {
      action:
        role[1].toLowerCase() === "setrole"
          ? "addrole"
          : (role[1].toLowerCase() as "addrole" | "removerole" | "togglerole"),
      roleId: role[2],
    };
  const call =
    /^(action|actions|setwarn|warn|unwarn|removewarn|addnote|note|timeout|removetimeout|kick|ban|unban|setnickname|reply|sendmessage|setrole|addrole|removerole|togglerole)\(([\s\S]*)\)$/i.exec(
      value,
    );
  if (call) {
    const name = call[1].toLowerCase();
    let data: Record<string, unknown>;
    try {
      if (name === "action")
        data = object(JSON.parse(call[2]), "Action", [
          "action",
          "target",
          "roleId",
          ...COMPONENT_ACTION_FIELDS,
        ]);
      else if (name === "actions")
        data = { action: "sequence", actions: JSON.parse(call[2]) };
      else {
        const args: unknown[] = JSON.parse(`[${call[2]}]`);
        const fields: Record<string, string[]> = {
          setrole: ["roleId", "userId"],
          addrole: ["roleId", "userId"],
          removerole: ["roleId", "userId"],
          togglerole: ["roleId", "userId"],
          setwarn: ["userId", "reason", "durationMs"],
          warn: ["userId", "reason", "durationMs"],
          unwarn: ["userId", "reason", "caseNumber"],
          removewarn: ["userId", "reason", "caseNumber"],
          addnote: ["userId", "reason"],
          note: ["userId", "reason"],
          timeout: ["userId", "durationMs", "reason"],
          removetimeout: ["userId", "reason"],
          kick: ["userId", "reason"],
          ban: ["userId", "reason", "deleteMessageSeconds"],
          unban: ["userId", "reason"],
          setnickname: ["userId", "nickname"],
          reply: ["text"],
          sendmessage: ["channelId", "text"],
        };
        if (args.length > fields[name].length)
          throw new CustomCommandValidationError(
            `Too many arguments for ${name}.`,
          );
        data = { action: name };
        args.forEach((arg, index) => {
          const field = fields[name][index];
          data[field] =
            field === "durationMs" && typeof arg === "string"
              ? (parseDuration(arg) ?? 0)
              : arg;
        });
      }
    } catch (error) {
      if (error instanceof CustomCommandValidationError) throw error;
      throw new CustomCommandValidationError(
        "Action arguments must use JSON strings, numbers or structured action objects. Quote IDs and text.",
      );
    }
    return new CustomCommandValidator().action(data);
  }
  return undefined;
}

function serializeAction(action: ComponentAction): string {
  if (
    "roleId" in action &&
    action.userId === undefined &&
    action.successMessage === undefined &&
    action.repeatable === undefined
  )
    return `${action.action}(${action.roleId})`;
  if ("target" in action) return `${action.action}(stage(${action.target}))`;
  if (action.action === "main" || action.action === "cancel")
    return action.action;
  return `Action(${JSON.stringify(new CustomCommandValidator().action({ ...action }))})`;
}

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
  let select: SelectTemplate | undefined;
  const responses: ResponseTemplate[] = [];
  const fail = (line: number, message: string): never => {
    throw new CustomCommandValidationError(`Markdown line ${line}: ${message}`);
  };
  const append = (line: string) => (field ? fieldBody : body).push(line);
  const finish = (line: number) => {
    if (!response) return;
    if (field) fail(line, "close the field with @endfield.");
    if (select) fail(line, "close the select with @endselect.");
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
      if (select) fail(number, "close the select before a stage marker.");
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
      if (select && line.trim()) fail(number, "use @option inside a select.");
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
    if (select) {
      if (key === "endselect" && !raw) {
        select = undefined;
        continue;
      }
      if (key === "option") {
        const option = /^\[((?:\\.|[^\]\\])*)\]\((.+)\)$/.exec(raw);
        const action = option && parseAction(option[2]);
        if (!option || !action)
          fail(
            number,
            "use @option [Label](Action); URL options are unsupported.",
          );
        select.options.push({
          label: option![1].replace(/\\(.)/g, "$1"),
          ...action!,
        });
        continue;
      }
      if (key === "option-description") {
        const option = select.options.at(-1);
        if (!option || option.description !== undefined)
          fail(number, "place one @option-description after an option.");
        option!.description = scalar(raw, number);
        continue;
      }
      fail(
        number,
        "close the select with @endselect before another directive.",
      );
    }
    if (key === "channel") {
      const id =
        /^(\d{17,20})$/.exec(raw)?.[1] ?? /^<#(\d{17,20})>$/.exec(raw)?.[1];
      if (!id)
        fail(
          number,
          "use @channel with a Discord channel ID, e.g. @channel 123456789012345678.",
        );
      append(`<#${id}>`);
      continue;
    }
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
    if (key === "select" || key === "dropdown") {
      select = { placeholder: scalar(raw, number), options: [] };
      (response!.selects ??= []).push(select);
      continue;
    }
    if (["option", "option-description", "endselect"].includes(key))
      fail(number, `@${key} requires an open @select.`);
    if (key === "button") {
      const styled =
        /^(?:(primary|secondary|success|danger|link)\s+)?(.*)$/i.exec(raw)!;
      const style = styled[1]?.toLowerCase();
      const link = /^\[((?:\\.|[^\]\\])*)\]\((.+)\)$/.exec(styled[2]);
      if (!link) fail(number, "use @button [Label](https://example.com).");
      const label = link![1].replace(/\\(.)/g, "$1");
      const target = link![2];
      const action = parseAction(target);
      if (action) {
        if (style === "link") fail(number, "actions cannot use link style.");
        (response!.buttons ??= []).push({
          label,
          ...action,
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
        const target = "url" in button ? button.url : serializeAction(button);
        const style =
          "action" in button && button.style ? `${button.style} ` : "";
        lines.push(
          `@button ${style}[${button.label.replace(/[\\\[\]]/g, "\\$&")}](${target})`,
        );
      }
      for (const select of response.selects ?? []) {
        add("select", select.placeholder);
        for (const option of select.options) {
          lines.push(
            `@option [${option.label.replace(/[\\\[\]]/g, "\\$&")}](${serializeAction(option)})`,
          );
          add("option-description", option.description);
        }
        lines.push("@endselect");
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
