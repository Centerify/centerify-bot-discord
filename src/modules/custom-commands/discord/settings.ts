import { trackCollector } from "../../../adapters/discord/resources.js";
import { randomUUID } from "node:crypto";
import {
  MessageFlags,
  type MessageComponentInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { logger } from "../../../adapters/logging/runtime.js";
import {
  CustomCommandError,
  CustomCommandValidationError,
} from "../domain/errors.js";
import {
  customCommandService,
  customCommandSharingService,
} from "./runtime.js";
import { openCustomCommandEditor } from "./editor.js";
import {
  customSettingsView,
  customSettingsWarning,
  type CustomSettingsState,
} from "./settingsView.js";
import {
  CustomCommandSharingConflictError,
  type CommandScope,
} from "./CustomCommandSharingService.js";

export async function openCustomCommandSettings(
  root: ButtonInteraction<"cached"> | ChatInputCommandInteraction<"cached">,
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
    commandIds: new Set(),
    scope: "server",
    choices: [],
    selected: new Set(),
    serverPage: 0,
  };
  const drafts = new Map<
    number,
    { scope: CommandScope; selected: Set<string> }
  >();
  const stage = () => {
    for (const id of state.commandIds!)
      drafts.set(id, { scope: state.scope, selected: new Set(state.selected) });
    state.dirty = true;
  };
  const loadScope = async (
    commandId: number | undefined,
    commands = state.commands,
  ) => {
    const command = commands.find((item) => item.id === commandId);
    const draft = command ? drafts.get(command.id) : undefined;
    const sharing =
      command && !draft ? await customCommandSharingService.get(command) : null;
    const scope = draft?.scope ?? sharing?.scope ?? "server";
    const choices =
      scope === "selected"
        ? await customCommandSharingService.discover(
            root.client,
            root.user.id,
            command?.sourceGuildId ?? root.guildId,
          )
        : [];
    state.scope = scope;
    state.selected = new Set(
      draft?.selected ??
        sharing?.selectedGuildIds.split(",").filter(Boolean) ??
        [],
    );
    state.dirty = Boolean(draft);
    state.serverPage = 0;
    state.choices = choices;
  };
  const load = async (initial = false) => {
    customCommandService.invalidate(root.guildId);
    const commands = (
      await customCommandSharingService.listAvailable(root.client, root.guild)
    ).sort((a, b) => a.name.localeCompare(b.name));
    const commandIds = new Set(
      [...state.commandIds!].filter((id) =>
        commands.some((command) => command.id === id),
      ),
    );
    if (initial && commands[0]) commandIds.add(commands[0].id);
    const commandId = commandIds.has(state.commandId!)
      ? state.commandId
      : [...commandIds][0];
    await loadScope(commandId, commands);
    state.commands = commands;
    state.commandIds = commandIds;
    state.commandId = commandId;
    if (!commands.some((row) => row.id === state.customizeId))
      state.customizeId = commandId ?? commands[0]?.id;
    for (const id of drafts.keys())
      if (!commands.some((command) => command.id === id)) drafts.delete(id);
    state.commandPage = Math.max(
      0,
      Math.min(state.commandPage, Math.ceil(commands.length / 25) - 1),
    );
  };
  await load(true);
  const message = await root.editReply(customSettingsView(state, session));
  let pending = Promise.resolve();
  const closedNotice =
    "This custom command settings session is closed. Reopen /settings to continue.";
  const collector = message.createMessageComponentCollector({
    // A fixed deadline keeps edits within the original interaction token lifetime.
    time: 10 * 60_000,
    filter: (item) => item.customId.startsWith(`cc-settings:${session}:`),
  });
  trackCollector("custom-commands", collector);
  let dismissWarning: ((content: string) => Promise<void>) | undefined;
  const closeWarning = async (content: string) => {
    const dismiss = dismissWarning;
    dismissWarning = undefined;
    await dismiss?.(content);
  };
  const handle = async (item: MessageComponentInteraction) => {
    const receivedAt = Date.now();
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
    if (collector.ended) {
      await item.reply({
        content: closedNotice,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    // Reserve click order before acknowledging; saves must see earlier selections.
    const previous = pending;
    let release!: () => void;
    const completed = new Promise<void>((resolve) => {
      release = resolve;
    });
    pending = previous.then(() => completed);
    const action = item.customId.split(":").at(-1);
    let acknowledged = false;
    let warningAccepted = false;
    try {
      if (action === "customize" && item.isButton())
        await item.deferReply({ flags: MessageFlags.Ephemeral });
      else await item.deferUpdate();
      acknowledged = true;
      await previous;
      if (collector.ended) throw new CustomCommandValidationError(closedNotice);
      if (
        state.needsReview &&
        (action === "save" || (action?.startsWith("proceed-") || action?.startsWith("replace-")))
      )
        throw new CustomCommandValidationError(
          "A previous click was not received in time. Retry your selection, or Refresh and review the displayed inputs before saving.",
        );
      if (
        !(await customCommandSharingService.canManage(root.guild, item.user.id))
      )
        throw new CustomCommandValidationError(
          "Administrator permission and verified ownership are required. Reopen Settings after access is restored.",
        );
      if (collector.ended) throw new CustomCommandValidationError(closedNotice);
      state.notice = undefined;
      const proceeding = (action?.startsWith("proceed-") || action?.startsWith("replace-")) && item.isButton();
      const cancelling = action?.startsWith("cancel-") && item.isButton();
      if (
        (proceeding || cancelling) &&
        (!state.confirmation ||
          action !==
            `${proceeding ? (action?.startsWith("replace-") ? "replace" : "proceed") : "cancel"}-${state.confirmation.id}`)
      )
        throw new CustomCommandValidationError(
          "This confirmation is no longer valid. Save Scope to review the current selection.",
        );
      await closeWarning(
        proceeding
          ? "Confirmation received. Saving scope…"
          : cancelling
            ? "Cancelled. Remaining scopes were not saved."
            : "Selection changed or settings closed. Click Save Scope again to review duplicates.",
      );
      warningAccepted = Boolean(proceeding);
      if (!proceeding) state.confirmation = undefined;
      if (cancelling) return;
      if (action === "close") {
        state.notice =
          "Custom command settings closed. Unsaved scope changes were discarded.";
        collector.stop("closed");
        return;
      }
      const command = state.commands.find((row) => row.id === state.commandId);
      const customizeCommand = state.commands.find(
        (row) => row.id === (state.customizeId ?? state.commandId),
      );
      if (action === "customize" && item.isButton() && customizeCommand) {
        customCommandService.invalidate(root.guildId);
        const current = customizeCommand.sourceGuildId
          ? { ...(await customCommandSharingService.forManagement(root.client, root.guild, root.user.id, customizeCommand)),
              guildId: root.guildId, sourceGuildId: customizeCommand.sourceGuildId }
          : await customCommandService.getCommand(root.guildId, customizeCommand.name);
        if (!current)
          throw new CustomCommandValidationError(
            "This command was removed. Refresh settings.",
          );
        await root.editReply(customSettingsView(state, session));
        await openCustomCommandEditor(item, current, (updated) => {
          const update = pending.then(async () => {
            if (collector.ended) return;
            state.commands = state.commands.map((row) =>
              row.id === updated.id ? updated : row,
            );
            state.confirmation = undefined;
            state.notice = undefined;
            await closeWarning(
              "The command changed. Click Save Scope again to review duplicates.",
            );
            await root.editReply(customSettingsView(state, session));
          });
          pending = update.catch((error) => {
            logger.error(
              { guildId: root.guildId, err: error },
              "custom_command.settings_sync_failed",
            );
          });
          return pending;
        });
        return;
      }
      if (action === "cancel")
        state.notice =
          "Scope was not saved. Review your selection before saving.";
      else if (action === "refresh") {
        await load();
        state.notice =
          "Commands and eligible servers refreshed. Unsaved scope changes were kept.";
      } else if (action === "customize-command" && item.isStringSelectMenu()) {
        const visible = state.commands.slice(state.commandPage * 25, (state.commandPage + 1) * 25);
        const id = Number(item.values[0]);
        if (item.values.length !== 1 || !visible.some((row) => row.id === id))
          throw new CustomCommandValidationError("Choose one command from this page.");
        state.customizeId = id;
      } else if (action === "only-command" && item.isButton() && customizeCommand) {
        await loadScope(customizeCommand.id);
        state.commandIds = new Set([customizeCommand.id]);
        state.commandId = customizeCommand.id;
      } else if (action === "command" && item.isStringSelectMenu()) {
        const visible = state.commands.slice(
          state.commandPage * 25,
          (state.commandPage + 1) * 25,
        );
        const ids = item.values.map(Number);
        if (ids.some((id) => !visible.some((row) => row.id === id)))
          throw new CustomCommandValidationError(
            "Choose commands from this page.",
          );
        const next = new Set(state.commandIds);
        for (const row of visible) next.delete(row.id);
        for (const id of ids) next.add(id);
        const commandId = next.has(state.commandId!)
          ? state.commandId
          : [...next][0];
        await loadScope(commandId);
        state.commandIds = next;
        state.commandId = commandId;
      } else if (action === "scope" && item.isStringSelectMenu()) {
        if (
          item.values.length !== 1 ||
          !["server", "all", "selected"].includes(item.values[0]!)
        )
          throw new CustomCommandValidationError("Choose a valid scope.");
        const scope = item.values[0] as CommandScope;
        if (!command)
          throw new CustomCommandValidationError("Select commands first.");
        if (scope === "selected") {
          state.choices = await customCommandSharingService.discover(
            root.client,
            root.user.id,
            command.sourceGuildId ?? root.guildId,
          );
          state.serverPage = 0;
        }
        state.scope = scope;
        stage();
      } else if (action === "servers" && item.isStringSelectMenu()) {
        if (state.scope !== "selected")
          throw new CustomCommandValidationError(
            "Choose Specific servers before selecting servers.",
          );
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
        stage();
      } else if (action === "clear") {
        state.selected.clear();
        stage();
      } else if (action === "command-previous")
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
      else if (
        (action === "save" || proceeding) &&
        item.isButton() &&
        command
      ) {
        if (!proceeding) stage();
        const remaining = proceeding
          ? [...state.confirmation!.remainingCommandIds!]
          : [...state.commandIds!];
        let savedCount = proceeding ? (state.confirmation!.savedCount ?? 0) : 0;
        const fingerprint = proceeding
          ? state.confirmation!.fingerprint
          : undefined;
        // Reload definitions by ID: Customize or another session may have changed them.
        customCommandService.invalidate(root.guildId);
        const current = await customCommandSharingService.listAvailable(root.client, root.guild);
        state.commands = current.sort((a, b) => a.name.localeCompare(b.name));
        for (const [index, id] of remaining.entries()) {
          if (collector.ended) break;
          const latest = current.find((row) => row.id === id);
          try {
            if (!latest)
              throw new CustomCommandValidationError(
                "A selected command was removed. Refresh and review the selection.",
              );
            await customCommandSharingService.save(
              root.client,
              root.user.id,
              latest,
              state.scope,
              [...state.selected],
              ...(index === 0 && fingerprint
                ? (action?.startsWith("replace-")
                    ? [fingerprint, "replace"] as const
                    : [fingerprint] as const)
                : []),
            );
            drafts.delete(id);
            savedCount++;
          } catch (error) {
            if (error instanceof CustomCommandSharingConflictError) {
              state.confirmation = {
                id: randomUUID(),
                fingerprint: error.fingerprint,
                conflicts: error.conflicts,
                remainingCommandIds: remaining.slice(index),
                savedCount,
              };
              state.notice = `${savedCount} command(s) saved. Review duplicates for ${latest?.name ?? "the selected command"}; ${remaining.length - index} command(s) still pending.`;
              throw error;
            }
            state.confirmation = undefined;
            state.notice = `${savedCount} command(s) saved; ${remaining.length - index} command(s) were not saved. Review the selection and retry.`;
            if (!collector.ended)
              await root.editReply(customSettingsView(state, session));
            throw error;
          }
        }
        state.confirmation = undefined;
        state.dirty = false;
        state.notice = `${savedCount === 1 ? "Command scope saved" : `${savedCount} command scopes saved`}. The original commands are used in every eligible server.`;
        if (warningAccepted)
          await item
            .editReply({
              content: collector.ended ? closedNotice : state.notice,
              embeds: [],
              components: [],
            })
            .catch(() => null);
      }
      if (
        ["command", "only-command", "scope", "servers", "clear", "refresh"].includes(
          action ?? "",
        )
      )
        state.needsReview = false;
      if (!collector.ended)
        await root.editReply(customSettingsView(state, session));
    } catch (error) {
      if (!acknowledged) {
        const code =
          error && typeof error === "object" && "code" in error
            ? error.code
            : undefined;
        // Never retry an expired callback or use its invalid token for a follow-up.
        // Restore the panel through the original reply, in click order.
        logger.error(
          {
            guildId: root.guildId,
            interactionId: item.id,
            action,
            code,
            ageAtHandlerMs: receivedAt - item.createdTimestamp,
            acknowledgementMs: Date.now() - receivedAt,
            gatewayPingMs: root.client.ws?.ping,
          },
          "custom_command.settings_acknowledgement_failed",
        );
        await previous;
        if (collector.ended) return;
        await closeWarning(
          "The last click failed. Review settings and click Save Scope again.",
        );
        state.needsReview = true;
        state.confirmation = undefined;
        state.notice =
          "Discord could not acknowledge the last click. It was not applied. Your earlier inputs are preserved. Retry your selection, or Refresh and review the displayed inputs before saving.";
        await root
          .editReply(customSettingsView(state, session))
          .catch(() => null);
        return;
      }
      if (
        error instanceof CustomCommandSharingConflictError &&
        !collector.ended
      ) {
        try {
          if (warningAccepted)
            await item
              .editReply({
                content:
                  "New duplicates need confirmation. Review the new warning below.",
                embeds: [],
                components: [],
              })
              .catch(() => null);
          const confirmationId = state.confirmation!.id;
          const warning = await item.followUp(
            customSettingsWarning(state, session),
          );
          const warningCollector = warning.createMessageComponentCollector({
            time: 2 * 60_000,
            filter: (click) =>
              [
                `cc-settings:${session}:proceed-${confirmationId}`,
                `cc-settings:${session}:replace-${confirmationId}`,
                `cc-settings:${session}:cancel-${confirmationId}`,
              ].includes(click.customId),
          });
  trackCollector("custom-commands", warningCollector);
          dismissWarning = async (content) => {
            warningCollector.stop("dismissed");
            await item.webhook
              .editMessage(warning.id, {
                content,
                embeds: [],
                components: [],
                allowedMentions: { parse: [] },
              })
              .catch(() => null);
          };
          warningCollector.on("collect", handle);
          warningCollector.on("end", (_items, reason) => {
            if (reason === "dismissed") return;
            if (state.confirmation?.id === confirmationId) {
              state.confirmation = undefined;
              dismissWarning = undefined;
            }
            void item.webhook
              .editMessage(warning.id, {
                content:
                  "This warning expired. Click Save Scope again to review duplicates.",
                embeds: [],
                components: [],
              })
              .catch(() => null);
          });
          if (collector.ended || state.confirmation?.id !== confirmationId)
            await closeWarning(closedNotice);
        } catch (renderError) {
          state.confirmation = undefined;
          logger.error(
            { guildId: root.guildId, err: renderError },
            "custom_command.settings_warning_failed",
          );
          await item
            .followUp({
              content:
                "Could not display the duplicate warning. Some earlier commands in the selection may already be saved. Refresh and review before trying Save Scope again.",
              flags: MessageFlags.Ephemeral,
              allowedMentions: { parse: [] },
            })
            .catch(() => null);
        }
        return;
      }
      if (!(error instanceof CustomCommandError))
        logger.error(
          { guildId: root.guildId, err: error },
          "custom_command.settings_failed",
        );
      const content =
        error instanceof CustomCommandError
          ? error.message
          : "Could not load or save custom command settings. Try again.";
      if (action === "customize" || warningAccepted)
        await item
          .editReply({ content, embeds: [], components: [] })
          .catch(() => null);
      else
        await item
          .followUp({
            content,
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
          })
          .catch(() => null);
    } finally {
      release();
    }
  };
  collector.on("collect", handle);
  collector.on("end", (_items, reason) => {
    state.confirmation = undefined;
    void closeWarning(closedNotice);
    if (reason !== "closed")
      state.notice =
        "Custom command settings expired. Reopen /custom options to continue; unsaved scope changes were discarded.";
    void root
      .editReply(customSettingsView(state, session, true))
      .catch(() => null);
  });
}
