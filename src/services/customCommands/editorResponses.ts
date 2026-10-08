import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ModalSubmitInteraction,
} from "discord.js";
import type {
  CustomCommandRecord,
  ResponseTemplate,
} from "../../lib/customCommands/types.js";
import { CustomCommandValidationError } from "../../lib/customCommands/errors.js";
import { CUSTOM_COMMAND_LIMITS as L } from "../../lib/customCommands/constants.js";
interface Input {
  id: string;
  label: string;
  value?: string;
  max?: number;
  required?: boolean;
  paragraph?: boolean;
}
export function editorModal(
  id: string,
  title: string,
  inputs: Input[],
): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(id).setTitle(title);
  for (const input of inputs) {
    const field = new TextInputBuilder()
      .setCustomId(input.id)
      .setLabel(input.label)
      .setStyle(
        input.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short,
      )
      .setRequired(input.required ?? false)
      .setMaxLength(input.max ?? L.text);
    if (input.value) field.setValue(input.value);
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(field),
    );
  }
  return modal;
}
export function responseModal(
  id: string,
  action: string,
  response: ResponseTemplate,
): ModalBuilder {
  if (action === "response" && response.type === "TEXT")
    return editorModal(id, "Edit response text", [
      {
        id: "text",
        label: "Response (supports variables)",
        value: response.text,
        max: L.text,
        required: true,
        paragraph: true,
      },
    ]);
  if (response.type !== "EMBED")
    throw new CustomCommandValidationError("Choose an embed response first.");
  const embed = response.embed;
  if (action === "response")
    return editorModal(id, "Edit embed", [
      { id: "title", label: "Title", value: embed.title, max: L.embedTitle },
      {
        id: "description",
        label: "Description",
        value: embed.description,
        max: L.modalInput,
        paragraph: true,
      },
      {
        id: "color",
        label: "Color (hex, e.g. #5865f2)",
        value:
          embed.color === undefined
            ? ""
            : `#${embed.color.toString(16).padStart(6, "0")}`,
        max: 7,
      },
      {
        id: "author",
        label: "Author name",
        value: embed.author?.name,
        max: L.embedAuthor,
      },
      {
        id: "footer",
        label: "Footer text",
        value: embed.footer?.text,
        max: L.embedFooter,
      },
    ]);
  if (action === "media")
    return editorModal(id, "Embed media", [
      {
        id: "thumbnail",
        label: "Thumbnail HTTPS URL",
        value: embed.thumbnail?.url,
        max: L.url,
      },
      {
        id: "image",
        label: "Image HTTPS URL",
        value: embed.image?.url,
        max: L.url,
      },
      {
        id: "author_icon",
        label: "Author icon HTTPS URL",
        value: embed.author?.icon_url,
        max: L.url,
      },
      {
        id: "footer_icon",
        label: "Footer icon HTTPS URL",
        value: embed.footer?.icon_url,
        max: L.url,
      },
      {
        id: "timestamp",
        label: "Timestamp: true, false or ISO date",
        value: String(embed.timestamp ?? false),
        max: 40,
      },
    ]);
  if (action === "links")
    return editorModal(id, "Embed links", [
      { id: "url", label: "Title HTTPS link", value: embed.url, max: L.url },
      {
        id: "author_url",
        label: "Author HTTPS link",
        value: embed.author?.url,
        max: L.url,
      },
    ]);
  if (action.startsWith("edit-field-")) {
    const field = embed.fields?.[Number(action.slice(11))];
    if (!field)
      throw new CustomCommandValidationError("That field no longer exists.");
    return editorModal(id, "Edit embed field", [
      {
        id: "name",
        label: "Field name",
        value: field.name,
        required: true,
        max: L.embedFieldName,
      },
      {
        id: "value",
        label: "Field value",
        value: field.value,
        required: true,
        paragraph: true,
        max: L.embedFieldValue,
      },
      {
        id: "inline",
        label: "Inline: true or false",
        value: String(field.inline ?? false),
        max: 5,
      },
      {
        id: "remove",
        label: "Delete this field: true or false",
        value: "false",
        max: 5,
      },
    ]);
  }
  return editorModal(id, "Add embed field", [
    { id: "name", label: "Field name", required: true, max: L.embedFieldName },
    {
      id: "value",
      label: "Field value",
      required: true,
      paragraph: true,
      max: L.embedFieldValue,
    },
    { id: "inline", label: "Inline: true or false", value: "false", max: 5 },
  ]);
}
export function applyResponseModal(
  command: CustomCommandRecord,
  index: number,
  action: string,
  modal: ModalSubmitInteraction,
): ResponseTemplate[] {
  const content = structuredClone(command.content);
  const response = content[index];
  if (!response)
    throw new CustomCommandValidationError("That response no longer exists.");
  const value = (key: string) => modal.fields.getTextInputValue(key).trim();
  if (response.type === "TEXT") {
    response.text = modal.fields.getTextInputValue("text");
    return content;
  }
  const embed = response.embed;
  if (action === "response") {
    const title = value("title"),
      description = value("description"),
      color = value("color"),
      author = value("author"),
      footer = value("footer");
    if (title) embed.title = title;
    else delete embed.title;
    if (description) embed.description = description;
    else delete embed.description;
    if (color && !/^#?[a-fA-F0-9]{6}$/.test(color))
      throw new CustomCommandValidationError(
        "Color must be a six-digit hex value.",
      );
    if (color) embed.color = parseInt(color.replace("#", ""), 16);
    else delete embed.color;
    if (author) embed.author = { ...embed.author, name: author };
    else delete embed.author;
    if (footer) embed.footer = { ...embed.footer, text: footer };
    else delete embed.footer;
  } else if (action === "media") {
    for (const key of ["thumbnail", "image"] as const) {
      const url = value(key);
      if (url) embed[key] = { url };
      else delete embed[key];
    }
    for (const key of ["author", "footer"] as const) {
      const url = value(`${key}_icon`);
      const item = embed[key];
      if (url && !item)
        throw new CustomCommandValidationError(
          `Set ${key} text before its icon.`,
        );
      if (item) {
        if (url) item.icon_url = url;
        else delete item.icon_url;
      }
    }
    const timestamp = value("timestamp");
    embed.timestamp =
      timestamp === "true"
        ? true
        : timestamp === "false" || !timestamp
          ? false
          : timestamp;
  } else if (action === "links") {
    const url = value("url"),
      authorUrl = value("author_url");
    if (url) embed.url = url;
    else delete embed.url;
    if (authorUrl && !embed.author)
      throw new CustomCommandValidationError(
        "Set author text before its link.",
      );
    if (embed.author) {
      if (authorUrl) embed.author.url = authorUrl;
      else delete embed.author.url;
    }
  } else {
    const editing = action.startsWith("edit-field-");
    const fieldIndex = editing ? Number(action.slice(11)) : -1;
    if (editing && !embed.fields?.[fieldIndex])
      throw new CustomCommandValidationError("That field no longer exists.");
    if (editing) {
      const remove = value("remove");
      if (!["true", "false", ""].includes(remove))
        throw new CustomCommandValidationError("Delete must be true or false.");
      if (remove === "true") {
        embed.fields!.splice(fieldIndex, 1);
        return content;
      }
    }
    if (!editing && (embed.fields?.length ?? 0) >= L.embedFields)
      throw new CustomCommandValidationError(
        `Embeds support at most ${L.embedFields} fields.`,
      );
    const inline = value("inline");
    if (!["true", "false", ""].includes(inline))
      throw new CustomCommandValidationError("Inline must be true or false.");
    const field = {
      name: value("name"),
      value: modal.fields.getTextInputValue("value"),
      inline: inline === "true",
    };
    if (editing) embed.fields![fieldIndex] = field;
    else embed.fields = [...(embed.fields ?? []), field];
  }
  return content;
}
