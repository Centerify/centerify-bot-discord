import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  ContainerBuilder,
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
  };
}
export function customSettingsView(
  state: CustomSettingsState,
  session: string,
  closed = false,
) {
  const container = new ContainerBuilder().setAccentColor(Colors.Blurple);
  const command = state.commands.find((item) => item.id === state.commandId);
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
      `## Custom Commands\n${state.notice ?? "Choose an existing command, customize it, and set where it runs."}\n` +
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
          .setPlaceholder("Choose a custom command")
          .setDisabled(closed)
          .addOptions(
            visible.map((item) => ({
              label: item.name.slice(0, 100),
              value: String(item.id),
              default: item.id === state.commandId,
            })),
          ),
      ),
    );
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
          `**${escapeMarkdown(command.name)}:** ${command.enabled ? "Enabled" : "Disabled"}\n**Scope:** ${state.scope === "all" ? "All eligible servers" : state.scope === "selected" ? "Selected servers" : "This server"}\n**Selected:** ${state.selected.size} other servers`,
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
                label: "This server only",
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
  if (state.confirmation) {
    const preview = state.confirmation.conflicts
      .slice(0, 8)
      .map(
        (conflict) =>
          `- ${escapeMarkdown(conflict.guildName.replace(/[\r\n]/g, " ").slice(0, 60))} (${conflict.guildId}): ${conflict.names
            .slice(0, 5)
            .map((name) => `\`${name}\``)
            .join(", ")}${conflict.names.length > 5 ? ", …" : ""}`,
      )
      .join("\n");
    const remaining = state.confirmation.conflicts.length - 8;
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### Duplicate commands found\n${preview}${remaining > 0 ? `\n… and ${remaining} more servers.` : ""}\nProceed saves this scope without replacing existing commands. Local commands take precedence; conflicting shared names will not run.`,
      ),
    );
    container.addActionRowComponents(
      buttons([
        [
          `proceed-${state.confirmation.id}`,
          "Proceed",
          false,
          ButtonStyle.Danger,
        ],
        ["cancel", "Cancel", false],
      ]),
    );
  }
  container.addActionRowComponents(
    buttons([
      [
        "save",
        "Save Scope",
        !command || (state.scope === "selected" && state.selected.size === 0),
        ButtonStyle.Success,
      ],
      ["customize", "Customize", !command, ButtonStyle.Primary],
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
