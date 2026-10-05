import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  ContainerBuilder,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  escapeMarkdown,
} from "discord.js";
import type { CustomCommandRecord } from "../../lib/customCommands/types.js";
import type {
  CommandScope,
  SharingConflict,
} from "./CustomCommandSharingService.js";

export interface CustomSettingsState {
  commands: CustomCommandRecord[];
  commandId?: number;
  customizeId?: number;
  commandIds?: Set<number>;
  dirty?: boolean;
  needsReview?: boolean;
  commandPage: number;
  scope: CommandScope;
  choices: { id: string; name: string }[];
  selected: Set<string>;
  serverPage: number;
  notice?: string;
  confirmation?: {
    id: string;
    fingerprint: string;
    conflicts: SharingConflict[];
    remainingCommandIds?: number[];
    savedCount?: number;
  };
}
export function customSettingsView(
  state: CustomSettingsState,
  session: string,
  closed = false,
) {
  const container = new ContainerBuilder().setAccentColor(Colors.Blurple);
  const command = state.commands.find((item) => item.id === state.commandId);
  const customizeCommand = state.commands.find(
    (item) => item.id === (state.customizeId ?? state.commandId),
  );
  const buttons = (items: [string, string, boolean, ButtonStyle?][]) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      items.map(([action, label, disabled, style]) =>
        new ButtonBuilder()
          .setCustomId(`cc-settings:${session}:${action}`)
          .setLabel(label)
          .setStyle(style ?? ButtonStyle.Secondary)
          .setDisabled(closed || disabled),
      ),
    );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## Custom Commands\n${state.notice ?? "Choose commands to share together. Use the separate customization dropdown to edit any one command, or Only This Command to set its individual scope."}\n` +
        "All servers includes verified servers where you are an administrator and Centerify is installed, including eligible servers added later. Local commands take precedence. Changes to a shared command apply everywhere.",
    ),
  );
  if (!state.commands.length) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "No custom commands saved in this server. Create one with `/custom create`, then return here to set its scope.",
      ),
    );
  } else {
    const visible = state.commands.slice(
      state.commandPage * 25,
      (state.commandPage + 1) * 25,
    );
    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`cc-settings:${session}:command`)
          .setPlaceholder("Choose commands to share together")
          .setMinValues(0)
          .setMaxValues(visible.length)
          .setDisabled(closed)
          .addOptions(
            visible.map((item) => ({
              label: item.name.slice(0, 100),
              description: item.sourceGuildId ? `Shared from ${item.sourceGuildId}` : "Saved in this server",
              value: String(item.id),
              default: state.commandIds
                ? state.commandIds.has(item.id)
                : item.id === state.commandId,
            })),
          ),
      ),
    );
    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`cc-settings:${session}:customize-command`)
          .setPlaceholder("Choose one command to customize")
          .setMinValues(1)
          .setMaxValues(1)
          .setDisabled(closed)
          .addOptions(visible.map((item) => ({
            label: item.name.slice(0, 100),
            description: item.sourceGuildId ? `Shared from ${item.sourceGuildId}` : "Saved in this server",
            value: String(item.id),
            default: item.id === customizeCommand?.id,
          }))),
      ),
    );
    if (customizeCommand)
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**Customize:** ${escapeMarkdown(customizeCommand.name)} • Editing this command keeps your sharing selection. **Only This Command** switches the scope controls to this command alone.${customizeCommand.sourceGuildId ? " This is a shared definition; edits apply in every server using it." : ""}`,
      ));
    if (state.commands.length > 25)
      container.addActionRowComponents(
        buttons([
          ["command-previous", "Previous Commands", state.commandPage === 0],
          [
            "command-next",
            "Next Commands",
            (state.commandPage + 1) * 25 >= state.commands.length,
          ],
        ]),
      );
    if (command) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**${escapeMarkdown(command.name)}:** ${command.enabled ? "Enabled" : "Disabled"}\n**Commands selected:** ${state.commandIds?.size ?? 1}\n**Scope:** ${state.scope === "all" ? "All eligible servers" : state.scope === "selected" ? "Selected servers" : "This server"}\n**Selected:** ${state.selected.size} other servers\n${state.dirty ? "Unsaved scope changes. " : ""}Save Scope applies the displayed scope to every selected command.`,
        ),
      );
      container.addActionRowComponents(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`cc-settings:${session}:scope`)
            .setPlaceholder("Where this command runs")
            .setDisabled(closed)
            .addOptions([
              {
                label: command.sourceGuildId ? "Original server only" : "This server only",
                value: "server",
                default: state.scope === "server",
              },
              {
                label: "All eligible servers",
                value: "all",
                default: state.scope === "all",
              },
              {
                label: "Specific servers",
                value: "selected",
                default: state.scope === "selected",
              },
            ]),
        ),
      );
      if (state.scope === "selected") {
        const servers = state.choices.slice(
          state.serverPage * 25,
          (state.serverPage + 1) * 25,
        );
        if (servers.length)
          container.addActionRowComponents(
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(`cc-settings:${session}:servers`)
                .setPlaceholder(
                  `Select servers • page ${state.serverPage + 1}/${Math.ceil(state.choices.length / 25)}`,
                )
                .setMinValues(0)
                .setMaxValues(servers.length)
                .setDisabled(closed)
                .addOptions(
                  servers.map((item) => ({
                    label: item.name.slice(0, 100),
                    value: item.id,
                    description: `Server ID: ${item.id}`,
                    default: state.selected.has(item.id),
                  })),
                ),
            ),
          );
        else
          container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              "No other eligible servers found. Server owners must verify and you need Administrator permission in each server.",
            ),
          );
        container.addActionRowComponents(
          buttons([
            ["server-previous", "Previous Servers", state.serverPage === 0],
            [
              "server-next",
              "Next Servers",
              (state.serverPage + 1) * 25 >= state.choices.length,
            ],
            ["clear", "Clear Selection", state.selected.size === 0],
          ]),
        );
      }
    }
  }
  container.addActionRowComponents(
    buttons([
      [
        "save",
        "Save Scope",
        Boolean(state.needsReview) ||
          !command ||
          (state.scope === "selected" && state.selected.size === 0),
        ButtonStyle.Success,
      ],
      [
        "customize",
        "Customize",
        !customizeCommand,
        ButtonStyle.Primary,
      ],
      ["only-command", "Only This Command", !customizeCommand],
      ["refresh", "Refresh", false],
      ["close", "Done", false],
    ]),
  );
  return {
    flags: MessageFlags.IsComponentsV2 as const,
    components: [container],
    allowedMentions: { parse: [] as [] },
  };
}

export function customSettingsWarning(
  state: CustomSettingsState,
  session: string,
) {
  const confirmation = state.confirmation!;
  const preview = confirmation.conflicts
    .slice(0, 8)
    .map(
      (conflict) =>
        `- ${escapeMarkdown(conflict.guildName.replace(/[\r\n]/g, " ").slice(0, 60))} (${conflict.guildId}): ${conflict.names
          .slice(0, 5)
          .map((name) => `\`${name}\``)
          .join(", ")}${conflict.names.length > 5 ? ", …" : ""}`,
    )
    .join("\n");
  const remaining = confirmation.conflicts.length - 8;
  return {
    flags: MessageFlags.Ephemeral as const,
    embeds: [
      new EmbedBuilder()
        .setColor(Colors.Yellow)
        .setTitle("Duplicate commands found")
        .setDescription(
          `${state.notice ?? ""}\n\n${preview}${remaining > 0 ? `\n… and ${remaining} more servers.` : ""}\n\nKeep Existing saves this scope and keeps server commands taking precedence. Replace Existing permanently deletes conflicting server custom commands, including their aliases, so the global command can run. Replacement is unavailable for legacy commands or commands shared with other servers. Cancel stops the remaining saves.`,
        ),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`cc-settings:${session}:proceed-${confirmation.id}`)
          .setLabel("Keep Existing")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`cc-settings:${session}:replace-${confirmation.id}`)
          .setLabel("Replace Existing")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(confirmation.conflicts.some((conflict) => !conflict.replaceable)),
        new ButtonBuilder()
          .setCustomId(`cc-settings:${session}:cancel-${confirmation.id}`)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    allowedMentions: { parse: [] as [] },
  };
}
