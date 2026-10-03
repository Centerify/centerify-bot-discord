import type { ChatInputCommandInteraction } from "discord.js";
import {
  customResponseService,
  type CustomResponseKind,
} from "../customResponseService.js";
import { showCommandList } from "./management.js";

/** Keep pre-existing custom responses and member events editable in the shared UI. */
export async function handleLegacyCustomResponse(
  interaction: ChatInputCommandInteraction<"cached">,
): Promise<void> {
  const guildId = interaction.guildId;
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "create") {
    const name = interaction.options
      .getString("name", true)
      .trim()
      .toLowerCase();
    const kind = interaction.options.getString(
      "kind",
      true,
    ) as CustomResponseKind;
    const trigger = (interaction.options.getString("trigger") ?? name)
      .trim()
      .toLowerCase();
    const channel = interaction.options.getChannel("channel");
    if (kind !== "command" && !channel) {
      await interaction.editReply(
        "Choose an output channel for a member event.",
      );
      return;
    }
    await customResponseService.create({
      guildId,
      name,
      kind,
      trigger,
      response: interaction.options.getString("response", true).trim(),
      channelId: channel?.id ?? null,
      allowedRoleId:
        kind === "command"
          ? (interaction.options.getRole("role")?.id ?? null)
          : null,
      adminOnly:
        kind === "command" &&
        (interaction.options.getBoolean("admin_only") ?? false),
      exactMatch: !(interaction.options.getBoolean("allow_args") ?? false),
      cooldownSeconds:
        kind === "command"
          ? (interaction.options.getInteger("cooldown") ?? 0)
          : 0,
      embed: interaction.options.getBoolean("embed") ?? false,
      createdBy: interaction.user.id,
    });
    await interaction.editReply(
      kind === "command"
        ? `Created **${name}**. Members can run it with \`!${trigger}\`.`
        : `Created **${name}** for ${kind === "member_join" ? "member joins" : "member leaves"}.`,
    );
  } else if (subcommand === "list") {
    const rules = await customResponseService.list(guildId);
    const lines = rules.map(
      (rule) =>
        `**${rule.name}** — ${rule.kind === "command" ? `!${rule.trigger}` : rule.kind.replace("_", " ")} • ${rule.enabled ? "on" : "off"}${rule.channelId ? ` • <#${rule.channelId}>` : ""}`,
    );
    await showCommandList(interaction, lines);
  } else {
    const name = interaction.options
      .getString("name", true)
      .trim()
      .toLowerCase();
    let changed = false;
    if (subcommand === "edit")
      changed = await customResponseService.setResponse(
        guildId,
        name,
        interaction.options.getString("response", true).trim(),
      );
    if (subcommand === "enable")
      changed = await customResponseService.setEnabled(
        guildId,
        name,
        interaction.options.getBoolean("enabled") ?? true,
      );
    if (subcommand === "delete")
      changed = await customResponseService.remove(guildId, name);
    await interaction.editReply(
      changed ? `Updated **${name}**.` : `No rule named **${name}** exists.`,
    );
  }
}
