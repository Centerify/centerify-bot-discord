import {
  AttachmentBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  escapeMarkdown,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { CUSTOM_COMMAND_LIMITS as L } from "../domain/constants.js";
import { CustomCommandNotFoundError } from "../domain/errors.js";
import type {
  CustomCommandDefinition,
  CustomCommandRecord,
  ResponseTemplate,
} from "../domain/types.js";
import {
  customCommandExecutor,
  customCommandService,
  customCommandSharingService,
  resolveExecutableCustomCommand,
} from "./runtime.js";
import { parseArguments } from "./CustomCommandVariableResolver.js";
import { readCommandAttachment } from "./CustomCommandImport.js";
import { markdownPatch } from "./markdown.js";
import { openCustomCommandEditor } from "./editor.js";

export function canManageCustomCommands(member: GuildMember): boolean {
  return (
    member.id === member.guild.ownerId ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  );
}
export function responseTemplate(text: string, type: string): ResponseTemplate {
  return type === "EMBED"
    ? { type: "EMBED", embed: { description: text } }
    : { type: "TEXT", text };
}
export function commandPatch(
  interaction: ChatInputCommandInteraction<"cached">,
  creating = false,
): Partial<CustomCommandDefinition> {
  const options = interaction.options;
  const patch: Record<string, unknown> = {};
  for (const [option, key] of [
    ["description", "description"],
    ["response_type", "responseType"],
    ["trigger_type", "triggerType"],
    ["cooldown_scope", "cooldownScope"],
  ]) {
    const value = options.getString(option);
    if (value !== null) patch[key] = value;
  }
  for (const [option, key] of [
    ["active", "enabled"],
    ["delete_invocation", "deleteInvocation"],
    ["reply", "replyToInvocation"],
  ]) {
    const value = options.getBoolean(option);
    if (value !== null) patch[key] = value;
  }
  const cooldown = options.getInteger("cooldown");
  if (cooldown !== null) patch.cooldownSeconds = cooldown;
  for (const [option, key] of [
    ["role", "allowedRoleIds"],
    ["denied_role", "deniedRoleIds"],
  ]) {
    const role = options.getRole(option);
    if (role) patch[key] = [role.id];
  }
  for (const [option, key] of [
    ["channel", "allowedChannelIds"],
    ["denied_channel", "deniedChannelIds"],
  ]) {
    const channel = options.getChannel(option);
    if (channel) patch[key] = [channel.id];
  }
  for (const [option, key] of [
    ["aliases", "aliases"],
    ["user_permissions", "requiredUserPermissions"],
    ["bot_permissions", "requiredBotPermissions"],
  ]) {
    const value = options.getString(option);
    if (value !== null)
      patch[key] =
        value.trim().toLowerCase() === "none"
          ? []
          : value
              .trim()
              .split(/[\s,]+/)
              .filter(Boolean);
  }
  if (options.getBoolean("admin_only"))
    patch.requiredUserPermissions = ["Administrator"];
  const response = options.getString("response");
  const type =
    options.getString("response_type") ??
    (options.getBoolean("embed") ? "EMBED" : "TEXT");
  if (response !== null) {
    patch.content = [responseTemplate(response, type)];
    patch.responseType = type;
  }
  if (creating) {
    patch.name = options.getString("name", true);
    const trigger = options.getString("trigger");
    if (
      trigger &&
      trigger.trim().toLowerCase() !== String(patch.name).trim().toLowerCase()
    )
      patch.aliases = [...((patch.aliases as string[]) ?? []), trigger];
  }
  // The service's runtime validator checks every field before writes.
  return patch as Partial<CustomCommandDefinition>;
}
export function commandInfo(command: CustomCommandRecord): EmbedBuilder {
  const ids = (values: string[], role = false) =>
    values.length
      ? values.map((id) => (role ? `<@&${id}>` : `<#${id}>`)).join(" ")
      : "Unrestricted";
  const embed = new EmbedBuilder()
    .setTitle(`Custom command: ${command.name}`)
    .setDescription(escapeMarkdown(command.description || "No description"))
    .addFields(
      ...[
        {
          name: "Aliases",
          value:
            command.aliases.map((alias) => escapeMarkdown(alias)).join(", ") ||
            "None",
        },
        {
          name: "Status / trigger / response",
          value: `${command.enabled ? "Enabled" : "Disabled"} / ${command.triggerType} / ${command.responseType}`,
        },
        {
          name: "Cooldown",
          value: `${command.cooldownSeconds}s / ${command.cooldownScope}`,
        },
        { name: "Allowed roles", value: ids(command.allowedRoleIds, true) },
        { name: "Denied roles", value: ids(command.deniedRoleIds, true) },
        { name: "Allowed channels", value: ids(command.allowedChannelIds) },
        { name: "Denied channels", value: ids(command.deniedChannelIds) },
        {
          name: "User / bot permissions",
          value: `${command.requiredUserPermissions.join(", ") || "None"} / ${command.requiredBotPermissions.join(", ") || "None"}`,
        },
        {
          name: "Usage",
          value: `${command.usageCount} uses • Last used: ${command.lastUsedAt ?? "Never"}`,
        },
        {
          name: "Audit",
          value: `Created by <@${command.createdBy}> at ${command.createdAt}\nUpdated by <@${command.updatedBy}> at ${command.updatedAt}`,
        },
      ].map((field) => ({
        ...field,
        value:
          field.value.length > L.embedFieldValue
            ? `${field.value.slice(0, L.embedFieldValue - 1)}…`
            : field.value,
      })),
    );
  return embed;
}
export async function showCommandList(
  interaction: ChatInputCommandInteraction<"cached">,
  legacyLines: string[],
): Promise<void> {
  const commands = await customCommandSharingService.listAvailable(
    interaction.client,
    interaction.guild,
  );
  const lines = [
    ...commands
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(
        (c) =>
          `**${escapeMarkdown(c.name)}** — ${c.responseType} • ${c.enabled ? "on" : "off"} • ${c.sharingScope === "all" ? "Global" : c.sharingScope === "selected" ? "Specific servers" : "Local"}${c.sourceGuildId ? ` • Shared from ${c.sourceGuildId}` : ""}`,
      ),
    ...legacyLines,
  ];
  if (!lines.length) {
    await interaction.editReply(
      "No custom commands or events yet. Use `/custom create` to add one.",
    );
    return;
  }
  const pages: string[][] = [];
  let current: string[] = [];
  let length = 0;
  for (const line of lines) {
    if (
      current.length &&
      (current.length >= L.pageSize ||
        length + line.length + 1 > L.listPageContent)
    ) {
      pages.push(current);
      current = [];
      length = 0;
    }
    current.push(line);
    length += line.length + 1;
  }
  if (current.length) pages.push(current);
  const page = Math.min(
    Math.max(interaction.options.getInteger("page") ?? 1, 1),
    pages.length,
  );
  await interaction.editReply({
    content: `${pages[page - 1]!.join("\n")}\nPage ${page}/${pages.length} • Use \`/custom list page:${Math.min(page + 1, pages.length)}\``,
    allowedMentions: { parse: [] },
  });
}
export async function handleCustomManagement(
  interaction: ChatInputCommandInteraction<"cached">,
): Promise<void> {
  const guildId = interaction.guildId;
  const actor = interaction.user.id;
  const sub = interaction.options.getSubcommand();
  if (sub === "options") {
    const { openCustomCommandSettings } = await import("./settings.js");
    await openCustomCommandSettings(interaction);
    return;
  }
  if (sub === "run") {
    const name = interaction.options.getString("command", true);
    // Resolve the definition and refresh the caller's permissions concurrently.
    const [command, member] = await Promise.all([
      resolveExecutableCustomCommand(
        interaction.client,
        interaction.guild,
        name,
      ),
      interaction.guild.members.fetch({ user: actor, force: true }),
    ]);
    if (!command)
      throw new CustomCommandNotFoundError(
        `No custom command named \`${name}\` exists.`,
      );
    const channel = interaction.channel;
    if (!channel || channel.isDMBased() || !("send" in channel))
      throw new CustomCommandNotFoundError("Use a text channel.");
    await customCommandExecutor.execute(
      {
        guildId,
        channelId: channel.id,
        userId: actor,
        guild: interaction.guild,
        channel,
        member,
        command,
        args: parseArguments(interaction.options.getString("args") ?? ""),
        source: "slash",
      },
      {
        send: async (payload) => {
          return command.replyToInvocation
            ? interaction.followUp({
                content: payload.content ?? undefined,
                embeds: payload.embeds,
                allowedMentions: payload.allowedMentions,
                components: payload.components,
              })
            : channel.send(payload);
        },
      },
    );
    await interaction.editReply({
      content: `Executed \`${command.name}\`.`,
      allowedMentions: { parse: [] },
    });
    return;
  }
  if (sub === "create") {
    const created = await customCommandService.createCommand(
      guildId,
      actor,
      commandPatch(interaction, true),
    );
    await interaction.editReply({
      content: `Custom command \`${created.name}\` created. Use \`!${created.name}\` or \`/custom run command:${created.name}\`. Use \`/custom configure\` for embeds, messages and access rules.`,
      allowedMentions: { parse: [] },
    });
    return;
  }
  if (sub === "export") {
    const output = await customCommandService.exportCommands(guildId);
    await interaction.editReply({
      content: "Version 1 custom commands export.",
      files: [
        new AttachmentBuilder(Buffer.from(output), {
          name: "centerify-custom-commands.json",
        }),
      ],
    });
    return;
  }
  if (sub === "import") {
    const count = await customCommandService.importCommands(
      guildId,
      actor,
      await readCommandAttachment(
        interaction.options.getAttachment("file", true),
      ),
    );
    await interaction.editReply(`Imported ${count} custom commands.`);
    return;
  }
  const name = interaction.options.getString("name", true);
  if (sub === "info" || sub === "configure" || sub === "template" || sub === "markdown") {
    customCommandService.invalidate(guildId);
    let command = await customCommandService.getCommand(guildId, name);
    if (!command) {
      const matches = (
        await customCommandSharingService.listAvailable(
          interaction.client,
          interaction.guild,
        )
      ).filter((row) => row.name === name.trim().toLowerCase());
      if (matches.length > 1)
        throw new CustomCommandNotFoundError(
          "Several shared commands have this name. Choose one in /custom options.",
        );
      command = matches[0] ?? null;
    }
    if (!command)
      throw new CustomCommandNotFoundError(
        `No custom command named \`${name}\` exists.`,
      );
    if (sub === "template" || sub === "markdown") {
      const source = await readCommandAttachment(
        interaction.options.getAttachment("file", true),
        "markdown",
      );
      const patch = markdownPatch(source);
      const current = command.sourceGuildId
        ? await customCommandSharingService.forManagement(
            interaction.client,
            interaction.guild,
            actor,
            command,
          )
        : command;
      const saved = await customCommandService.updateCommand(
        current.guildId,
        actor,
        current.name,
        patch,
        "updated",
        command.updatedAt,
      );
      await openCustomCommandEditor(
        interaction,
        command.sourceGuildId
          ? {
              ...saved,
              guildId,
              sourceGuildId: current.guildId,
              sharingScope: command.sharingScope,
            }
          : saved,
      );
    } else if (sub === "configure") {
      if (command.sourceGuildId)
        await customCommandSharingService.forManagement(
          interaction.client,
          interaction.guild,
          actor,
          command,
        );
      await openCustomCommandEditor(interaction, command);
    } else
      await interaction.editReply({
        embeds: [commandInfo(command)],
        allowedMentions: { parse: [] },
      });
    return;
  }
  const actions: Record<string, () => Promise<CustomCommandRecord>> = {
    edit: async () => {
      const patch = commandPatch(interaction);
      if (
        patch.content &&
        !interaction.options.getString("response_type") &&
        interaction.options.getBoolean("embed") === null
      ) {
        const current = await customCommandService.getCommand(guildId, name);
        if (current?.content.length === 1) {
          patch.content = [
            responseTemplate(
              interaction.options.getString("response", true),
              current.content[0]!.type,
            ),
          ];
          patch.responseType = current.content[0]!.type;
        }
      }
      return customCommandService.updateCommand(guildId, actor, name, patch);
    },
    delete: () => customCommandService.deleteCommand(guildId, actor, name),
    enable: () =>
      interaction.options.getBoolean("enabled") === false
        ? customCommandService.disableCommand(guildId, actor, name)
        : customCommandService.enableCommand(guildId, actor, name),
    disable: () => customCommandService.disableCommand(guildId, actor, name),
    rename: () =>
      customCommandService.renameCommand(
        guildId,
        actor,
        name,
        interaction.options.getString("new_name", true),
      ),
    clone: () =>
      customCommandService.cloneCommand(
        guildId,
        actor,
        name,
        interaction.options.getString("new_name", true),
      ),
  };
  const action = actions[sub];
  if (!action)
    throw new CustomCommandNotFoundError("Unknown custom command action.");
  const changed = await action();
  await interaction.editReply({
    content: `Custom command \`${changed.name}\`: ${sub} completed.`,
    allowedMentions: { parse: [] },
  });
}
