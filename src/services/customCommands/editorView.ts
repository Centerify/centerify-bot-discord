import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
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
  const panel = (description: string) => ({
    content: null,
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`Custom command editor • ${command.name}`)
        .setDescription(description)
        .setFooter({
          text: "Changes save immediately • Editor expires after 3 minutes",
        }),
    ],
  });
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
    new ButtonBuilder()
      .setCustomId(`${prefix}preview`)
      .setLabel("Preview")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${prefix}variables`)
      .setLabel("Variables")
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
    const content = `**Access rules • ${restriction}**\nCurrent: ${command[restriction as (typeof RESTRICTION_KEYS)[number]].join(", ") || "None"}\n\nDenied roles/channels take priority. Empty allowed lists are unrestricted.`;
    if (restriction.endsWith("RoleIds"))
      return {
        ...panel(content),
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
        ...panel(content),
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
      ...panel(content),
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
  const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}markdown`)
      .setLabel("Edit Markdown")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${prefix}markdown-download`)
      .setLabel("Download .md")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${prefix}markdown-help`)
      .setLabel("Syntax & example")
      .setStyle(ButtonStyle.Secondary),
  );
  return {
    ...panel(
      `**Markdown responses**\n${command.content.length} ordered response(s) • ${command.cooldownSeconds}s ${command.cooldownScope} cooldown.\n\nWrite messages, colored embeds, covers and buttons in one template. Use @main and @stage(n) for interactive pages. **Edit Markdown** replaces all responses after validation. Use **Preview** to check the saved result.\n\nFor templates over 4,000 characters, download the source, edit it, then upload it with \`/custom markdown name:${command.name} file:…\`.`,
    ),
    components: [navigation, controls],
    allowedMentions: { parse: [] as [] },
  };
}
