import { randomUUID } from "node:crypto";
import {
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type RepliableInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { logger } from "../../logger.js";
import { requireVerifiedOwnership } from "../guildOwnershipService.js";
import {
  CUSTOM_COMMAND_LIMITS as L,
  RESTRICTION_KEYS,
} from "../../lib/customCommands/constants.js";
import {
  CustomCommandError,
  CustomCommandValidationError,
} from "../../lib/customCommands/errors.js";
import type {
  CustomCommandDefinition,
  CustomCommandRecord,
} from "../../lib/customCommands/types.js";
import { customCommandService, customCommandSharingService } from "./runtime.js";
import {
  applyResponseModal,
  editorModal,
  responseModal,
} from "./editorResponses.js";
import { editorView, type EditorSection } from "./editorView.js";

async function authorize(
  interaction: RepliableInteraction,
  guildId: string,
): Promise<boolean> {
  if (!interaction.inCachedGuild() || interaction.guildId !== guildId)
    return false;
  const member = await interaction.guild.members.fetch({
    user: interaction.user.id,
    force: true,
  });
  if (
    member.id !== interaction.guild.ownerId &&
    !member.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    await interaction.followUp({
      content: "Administrator permission is required to edit custom commands.",
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return requireVerifiedOwnership(interaction);
}
export async function openCustomCommandEditor(
  root: ChatInputCommandInteraction<"cached"> | ButtonInteraction<"cached">,
  initial: CustomCommandRecord,
  onSaved?: (command: CustomCommandRecord) => Promise<void>,
): Promise<void> {
  const session = randomUUID();
  let command = initial;
  const update = async (patch: Partial<CustomCommandDefinition>) => {
    if (!command.sourceGuildId)
      return customCommandService.updateCommand(root.guildId, root.user.id, command.name, patch, "updated", command.updatedAt);
    const current = await customCommandSharingService.forManagement(root.client, root.guild, root.user.id, command);
    if (["allowedRoleIds", "deniedRoleIds", "allowedChannelIds", "deniedChannelIds"].some(
      (key) => (patch[key as keyof CustomCommandDefinition] as string[] | undefined)?.length,
    ))
      throw new CustomCommandValidationError("Role and channel restrictions belong to one server. Use Discord permission requirements for shared commands.");
    const saved = await customCommandService.updateCommand(
      current.guildId, root.user.id, current.name, patch, "updated", command.updatedAt,
    );
    return { ...saved, guildId: root.guildId, sourceGuildId: current.guildId, sharingScope: command.sharingScope };
  };
  let section: EditorSection = "responses",
    index = 0,
    restriction: (typeof RESTRICTION_KEYS)[number] = "allowedRoleIds",
    busy = false;
  const render = () =>
    editorView(command, session, section, index, restriction);
  const message = await root.editReply(render());
  const collector = message.createMessageComponentCollector({
    time: 180_000,
    filter: (interaction) => interaction.customId.startsWith(`cc:${session}:`),
  });
  collector.on("collect", async (interaction) => {
    if (interaction.user.id !== root.user.id) {
      await interaction.reply({
        content: "Only the administrator who opened this editor can use it.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (busy) {
      await interaction.reply({
        content: "Finish the active edit first.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    busy = true;
    let modalReply: ModalSubmitInteraction | undefined;
    try {
      const action = interaction.customId.split(":").at(-1)!;
      if (
        ["response", "media", "field", "permissions", "settings"].includes(
          action,
        ) &&
        interaction.isButton()
      ) {
        // Showing a modal is the acknowledgement. Every submission is authorized before saving.
        const id = `cc-modal:${session}:${randomUUID()}`;
        const modal =
          action === "permissions"
            ? editorModal(id, "Discord permission names", [
                {
                  id: "permissions",
                  label: "Names separated by spaces (empty clears)",
                  value: command[restriction].join(" "),
                  max: L.restrictions * (L.name + 1),
                  paragraph: true,
                },
              ])
            : action === "settings"
              ? editorModal(id, "Command settings", [
                  {
                    id: "description",
                    label: "Description",
                    value: command.description,
                    max: L.description,
                  },
                  {
                    id: "aliases",
                    label: "Aliases separated by spaces (empty clears)",
                    value: command.aliases.join(" "),
                    max: L.aliases * (L.name + 1),
                  },
                  {
                    id: "cooldown",
                    label: "Cooldown seconds (0–86400)",
                    value: String(command.cooldownSeconds),
                    max: 5,
                    required: true,
                  },
                  {
                    id: "scope",
                    label: "Scope: USER, CHANNEL, GUILD, GLOBAL_COMMAND",
                    value: command.cooldownScope,
                    max: 20,
                    required: true,
                  },
                  {
                    id: "flags",
                    label: "enabled, reply, delete (comma-separated)",
                    value: [
                      command.enabled ? "enabled" : "",
                      command.replyToInvocation ? "reply" : "",
                      command.deleteInvocation ? "delete" : "",
                    ]
                      .filter(Boolean)
                      .join(","),
                    max: 50,
                  },
                ])
              : responseModal(id, action, command.content[index]!);
        await interaction.showModal(modal);
        const submitted = await interaction
          .awaitModalSubmit({
            time: 90_000,
            filter: (submission) =>
              submission.customId === id &&
              submission.user.id === root.user.id &&
              submission.guildId === root.guildId,
          })
          .catch(() => null);
        if (!submitted) return;
        await submitted.deferReply({ flags: MessageFlags.Ephemeral });
        modalReply = submitted;
        if (!(await authorize(submitted, root.guildId))) return;
        const value = (key: string) =>
          submitted.fields.getTextInputValue(key).trim();
        let patch: Partial<CustomCommandDefinition>;
        if (action === "permissions")
          patch = {
            [restriction]: value("permissions")
              .split(/[\s,]+/)
              .filter(Boolean),
          };
        else if (action === "settings") {
          const flags = value("flags")
            .split(",")
            .map((flag) => flag.trim())
            .filter(Boolean);
          if (
            flags.some((flag) => !["enabled", "reply", "delete"].includes(flag))
          )
            throw new CustomCommandValidationError(
              "Flags may contain enabled, reply and delete.",
            );
          patch = {
            description: value("description"),
            aliases: value("aliases").split(/\s+/).filter(Boolean),
            cooldownSeconds: Number(value("cooldown")),
            cooldownScope: value(
              "scope",
            ) as CustomCommandDefinition["cooldownScope"],
            enabled: flags.includes("enabled"),
            replyToInvocation: flags.includes("reply"),
            deleteInvocation: flags.includes("delete"),
          };
        } else
          patch = {
            content: applyResponseModal(command, index, action, submitted),
          };
        try {
          command = await update(patch);
          await submitted.editReply("Custom command updated.");
          await onSaved?.(command);
          await root.editReply({
            ...render(),
            ...(collector.ended ? { components: [] } : {}),
          });
        } catch (error) {
          await submitted.editReply(
            error instanceof CustomCommandError
              ? error.message
              : "Could not save this edit.",
          );
          if (!(error instanceof CustomCommandError))
            logger.error(
              { guildId: root.guildId, commandId: command.id },
              "custom_command.editor_failed",
            );
        }
        return;
      }
      await interaction.deferUpdate();
      if (!(await authorize(interaction, root.guildId))) return;
      if (action === "responses" || action === "access") section = action;
      else if (action === "message" && interaction.isStringSelectMenu())
        index = Number(interaction.values[0]);
      else if (action === "restriction" && interaction.isStringSelectMenu()) {
        const selected = interaction.values[0];
        if (RESTRICTION_KEYS.includes(selected as typeof restriction))
          restriction = selected as typeof restriction;
      } else {
        let patch: Partial<CustomCommandDefinition>;
        if (action === "clear") patch = { [restriction]: [] };
        else if (
          (action === "roles" &&
            interaction.isRoleSelectMenu() &&
            restriction.endsWith("RoleIds")) ||
          (action === "channels" &&
            interaction.isChannelSelectMenu() &&
            restriction.endsWith("ChannelIds"))
        )
          patch = { [restriction]: interaction.values };
        else {
          const content = structuredClone(command.content);
          if (action === "add-text" || action === "add-embed") {
            if (content.length >= L.messages)
              throw new CustomCommandValidationError(
                `Use at most ${L.messages} messages.`,
              );
            content.push(
              action === "add-text"
                ? { type: "TEXT", text: "New response" }
                : { type: "EMBED", embed: { description: "New response" } },
            );
            index = content.length - 1;
          } else if (action === "remove-message" && content.length > 1) {
            content.splice(index, 1);
            index = Math.min(index, content.length - 1);
          } else if (action === "remove-field") {
            const response = content[index];
            if (response?.type !== "EMBED")
              throw new CustomCommandValidationError("Choose an embed first.");
            response.embed.fields?.pop();
          } else
            throw new CustomCommandValidationError(
              "Choose a valid editor action.",
            );
          patch = {
            content,
            responseType: content.length > 1 ? "MULTI" : content[0]!.type,
          };
        }
        command = await update(patch);
        await onSaved?.(command);
      }
      if (!command.content[index]) index = 0;
      await root.editReply({
        ...render(),
        ...(collector.ended ? { components: [] } : {}),
      });
    } catch (error) {
      const content =
        error instanceof CustomCommandError
          ? error.message
          : "Could not update this command. Reopen the editor and try again.";
      if (!(error instanceof CustomCommandError))
        logger.error(
          { guildId: root.guildId, commandId: command.id },
          "custom_command.editor_failed",
        );
      if (!command.content[index]) index = 0;
      if (modalReply)
        await modalReply
          .editReply({ content, allowedMentions: { parse: [] } })
          .catch(() => {});
      else
        await interaction
          .followUp({
            content,
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
          })
          .catch(() => {});
    } finally {
      busy = false;
    }
  });
  collector.on("end", () => {
    void root.editReply({ components: [] }).catch(() => {});
  });
}
