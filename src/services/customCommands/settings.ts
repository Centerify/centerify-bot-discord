import { randomUUID } from "node:crypto";
import { MessageFlags, type ButtonInteraction } from "discord.js";
import { logger } from "../../logger.js";
import {
  CustomCommandError,
  CustomCommandValidationError,
} from "../../lib/customCommands/errors.js";
import {
  customCommandService,
  customCommandSharingService,
} from "./runtime.js";
import { openCustomCommandEditor } from "./editor.js";
import {
  customSettingsView,
  type CustomSettingsState,
} from "./settingsView.js";
import type { CommandScope } from "./CustomCommandSharingService.js";

export async function openCustomCommandSettings(
  root: ButtonInteraction<"cached">,
) {
  if (
    !(await customCommandSharingService.canManage(root.guild, root.user.id))
  ) {
    await root.editReply({
      content:
        "Administrator permission and verified server ownership are required to manage custom commands.",
    });
    return;
  }
  const session = randomUUID();
  const state: CustomSettingsState = {
    commands: [],
    commandPage: 0,
    scope: "server",
    choices: [],
    selected: new Set(),
    serverPage: 0,
  };
  const load = async () => {
    customCommandService.invalidate(root.guildId);
    state.commands = (
      await customCommandService.listCommands(root.guildId)
    ).sort((a, b) => a.name.localeCompare(b.name));
    state.commandId =
      state.commands.find((command) => command.id === state.commandId)?.id ??
      state.commands[0]?.id;
    state.commandPage = Math.max(
      0,
      Math.floor(
        state.commands.findIndex((command) => command.id === state.commandId) /
          25,
      ),
    );
    await loadScope();
  };
  const loadScope = async () => {
    const command = state.commands.find((item) => item.id === state.commandId);
    const sharing = command
      ? await customCommandSharingService.get(command)
      : null;
    state.scope = sharing?.scope ?? "server";
    state.selected = new Set(
      sharing?.selectedGuildIds.split(",").filter(Boolean) ?? [],
    );
    state.serverPage = 0;
    state.choices =
      state.scope === "selected"
        ? await customCommandSharingService.discover(
            root.client,
            root.user.id,
            root.guildId,
          )
        : [];
  };
  await load();
  const message = await root.editReply(customSettingsView(state, session));
  let busy = false;
  const collector = message.createMessageComponentCollector({
    time: 10 * 60_000,
    filter: (item) => item.customId.startsWith(`cc-settings:${session}:`),
  });
  collector.on("collect", async (item) => {
    if (
      item.user.id !== root.user.id ||
      !item.inCachedGuild() ||
      item.guildId !== root.guildId
    ) {
      await item.reply({
        content:
          "Only the administrator who opened these settings can use them.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (busy || collector.ended) {
      await item.reply({
        content: "Finish the current action or reopen Settings.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    busy = true;
    const action = item.customId.split(":").at(-1);
    try {
      if (action === "customize" && item.isButton())
        await item.deferReply({ flags: MessageFlags.Ephemeral });
      else await item.deferUpdate();
      if (
        !(await customCommandSharingService.canManage(root.guild, item.user.id))
      )
        throw new CustomCommandValidationError(
          "Administrator permission and verified ownership are required. Reopen Settings after access is restored.",
        );
      collector.resetTimer();
      state.notice = undefined;
      if (action === "close") {
        state.notice =
          "Custom command settings closed. Unsaved scope changes were discarded.";
        collector.stop("closed");
        return;
      }
      const command = state.commands.find((row) => row.id === state.commandId);
      if (action === "customize" && item.isButton() && command) {
        customCommandService.invalidate(root.guildId);
        const current = await customCommandService.getCommand(
          root.guildId,
          command.name,
        );
        if (!current)
          throw new CustomCommandValidationError(
            "This command was removed. Refresh settings.",
          );
        await openCustomCommandEditor(item, current);
        return;
      }
      if (action === "refresh") await load();
      else if (action === "command" && item.isStringSelectMenu()) {
        const id = Number(item.values[0]);
        if (
          !state.commands
            .slice(state.commandPage * 25, (state.commandPage + 1) * 25)
            .some((row) => row.id === id)
        )
          throw new CustomCommandValidationError(
            "Choose a command from this page.",
          );
        state.commandId = id;
        await loadScope();
      } else if (action === "scope" && item.isStringSelectMenu()) {
        if (
          item.values.length !== 1 ||
          !["server", "all", "selected"].includes(item.values[0]!)
        )
          throw new CustomCommandValidationError("Choose a valid scope.");
        state.scope = item.values[0] as CommandScope;
        if (state.scope === "selected")
          state.choices = await customCommandSharingService.discover(
            root.client,
            root.user.id,
            root.guildId,
          );
      } else if (action === "servers" && item.isStringSelectMenu()) {
        const visible = state.choices.slice(
          state.serverPage * 25,
          (state.serverPage + 1) * 25,
        );
        if (
          item.values.some((id) => !visible.some((choice) => choice.id === id))
        )
          throw new CustomCommandValidationError(
            "Choose servers from the current page.",
          );
        const next = new Set(state.selected);
        for (const choice of visible) next.delete(choice.id);
        for (const id of item.values) next.add(id);
        if (next.size > 100)
          throw new CustomCommandValidationError("Choose at most 100 servers.");
        state.selected = next;
      } else if (action === "clear") state.selected.clear();
      else if (action === "command-previous")
        state.commandPage = Math.max(0, state.commandPage - 1);
      else if (action === "command-next")
        state.commandPage = Math.min(
          Math.ceil(state.commands.length / 25) - 1,
          state.commandPage + 1,
        );
      else if (action === "server-previous")
        state.serverPage = Math.max(0, state.serverPage - 1);
      else if (action === "server-next")
        state.serverPage = Math.max(
          0,
          Math.min(
            Math.ceil(state.choices.length / 25) - 1,
            state.serverPage + 1,
          ),
        );
      else if (action === "save" && command) {
        await customCommandSharingService.save(
          root.client,
          root.user.id,
          command,
          state.scope,
          [...state.selected],
        );
        state.notice =
          "Command scope saved. The original command is used in every eligible server.";
      }
      if (!collector.ended)
        await root.editReply(customSettingsView(state, session));
    } catch (error) {
      if (!(error instanceof CustomCommandError))
        logger.error(
          { guildId: root.guildId, err: error },
          "custom_command.settings_failed",
        );
      const content =
        error instanceof CustomCommandError
          ? error.message
          : "Could not load or save custom command settings. Try again.";
      if (action === "customize")
        await item.editReply({ content }).catch(() => null);
      else
        await item
          .followUp({
            content,
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
          })
          .catch(() => null);
    } finally {
      busy = false;
    }
  });
  collector.on("end", (_items, reason) => {
    if (reason !== "closed")
      state.notice =
        "Custom command settings expired. Reopen /settings to continue; unsaved scope changes were discarded.";
    void root
      .editReply(customSettingsView(state, session, true))
      .catch(() => null);
  });
}
