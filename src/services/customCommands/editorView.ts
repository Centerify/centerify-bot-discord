import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import type { CustomCommandRecord } from "../../lib/customCommands/types.js";
import {
  CUSTOM_COMMAND_LIMITS as L,
  RESTRICTION_KEYS,
} from "../../lib/customCommands/constants.js";
export type EditorSection = "responses" | "access";
export function editorView(
  command: CustomCommandRecord,
  session: string,
  section: EditorSection,
  index: number,
  restriction: string,
) {
  const prefix = `cc:${session}:`;
  const navigation = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}responses`)
      .setLabel("Responses")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${prefix}access`)
      .setLabel("Access rules")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${prefix}settings`)
      .setLabel("Settings")
      .setStyle(ButtonStyle.Secondary),
  );
  if (section === "access") {
    const selector =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${prefix}restriction`)
          .setPlaceholder("Choose an access restriction")
          .addOptions(
            RESTRICTION_KEYS.map((key) => ({
              label: key,
              value: key,
              default: key === restriction,
            })),
          ),
      );
    const clear = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${prefix}clear`)
        .setLabel("Clear this restriction")
        .setStyle(ButtonStyle.Danger),
    );
    const content = `Editing **${command.name}** • ${restriction}\nCurrent: ${command[restriction as (typeof RESTRICTION_KEYS)[number]].join(", ") || "None"}\nDenied roles/channels take priority. Empty allowed lists are unrestricted.`;
    if (restriction.endsWith("RoleIds"))
      return {
        content,
        components: [
          navigation,
          selector,
          new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
            new RoleSelectMenuBuilder()
              .setCustomId(`${prefix}roles`)
              .setPlaceholder("Select allowed or denied roles")
              .setMinValues(1)
              .setMaxValues(L.restrictions),
          ),
          clear,
        ],
        allowedMentions: { parse: [] as [] },
      };
    if (restriction.endsWith("ChannelIds"))
      return {
        content,
        components: [
          navigation,
          selector,
          new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
            new ChannelSelectMenuBuilder()
              .setCustomId(`${prefix}channels`)
              .setPlaceholder("Select allowed or denied channels")
              .setChannelTypes(
                ChannelType.GuildText,
                ChannelType.GuildAnnouncement,
                ChannelType.PublicThread,
                ChannelType.PrivateThread,
                ChannelType.GuildVoice,
              )
              .setMinValues(1)
              .setMaxValues(L.restrictions),
          ),
          clear,
        ],
        allowedMentions: { parse: [] as [] },
      };
    return {
      content,
      components: [
        navigation,
        selector,
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${prefix}permissions`)
            .setLabel("Edit permission names")
            .setStyle(ButtonStyle.Primary),
        ),
        clear,
      ],
      allowedMentions: { parse: [] as [] },
    };
  }
  const response = command.content[index]!;
  const selector =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${prefix}message`)
        .setPlaceholder("Choose response message")
        .addOptions(
          command.content.map((entry, i) => ({
            label: `Message ${i + 1}: ${entry.type}`,
            value: String(i),
            default: i === index,
          })),
        ),
    );
  const edit = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}response`)
      .setLabel("Edit text / embed")
      .setStyle(ButtonStyle.Primary),
  );
  if (response.type === "EMBED")
    edit.addComponents(
      new ButtonBuilder()
        .setCustomId(`${prefix}media`)
        .setLabel("Media / timestamp")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${prefix}field`)
        .setLabel("Add field")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${prefix}remove-field`)
        .setLabel("Remove last field")
        .setStyle(ButtonStyle.Secondary),
    );
  const messages = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}add-text`)
      .setLabel("Add text message")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${prefix}add-embed`)
      .setLabel("Add embed message")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${prefix}remove-message`)
      .setLabel("Remove selected message")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(command.content.length === 1),
  );
  return {
    content: `Editing **${command.name}** • Message ${index + 1}/${command.content.length}\n${command.content.length} ordered response(s), ${command.cooldownSeconds}s ${command.cooldownScope} cooldown. Changes save immediately.`,
    components: [navigation, selector, edit, messages],
    allowedMentions: { parse: [] as [] },
  };
}
