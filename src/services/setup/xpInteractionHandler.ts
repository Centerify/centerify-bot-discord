import { ActionRowBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction } from "discord.js";
import type { Command } from "@sapphire/framework";
import { guildConfigService, type GuildConfig, type GuildConfigUpdate } from "../guildConfigService.js";
import { requireVerifiedOwnership } from "../guildOwnershipService.js";
import { xpConfigurationService } from "../xpConfigurationService.js";
import { parseSharedGuildIds } from "../xpPolicy.js";
import { canManageServer } from "./guards.js";
import type { SetupRenderer } from "./renderer.js";

export async function handleXpModal(
  interaction: ButtonInteraction<"cached">,
  root: Command.ChatInputCommandInteraction<"cached">,
  config: GuildConfig,
  sessionId: string,
  action: "xp-rewards" | "xp-peers" | "xp-apply",
  renderer: SetupRenderer,
  update: (guildId: string, data: GuildConfigUpdate) => Promise<GuildConfig>,
) {
  const modalId = `setup:${sessionId}:${action}-modal`;
  const modal = new ModalBuilder().setCustomId(modalId).setTitle(action === "xp-rewards" ? "XP Rewards" : action === "xp-peers" ? "Selected XP Servers" : "Apply XP to Servers");
  const fields = action === "xp-rewards" ? [
    ["messages", "Message XP (1–10000)", String(config.xpMessageAmount)],
    ["reactions", "Reaction XP (1–10000)", String(config.xpReactionAmount)],
    ["daily", "Daily XP (1–10000)", String(config.xpDailyAmount)],
    ["cooldown", "Cooldown (10–3600 seconds)", String(config.xpCooldownSeconds)],
  ] : [["servers", action === "xp-peers" ? "Server IDs separated by commas; or clear" : "Target server IDs separated by commas", action === "xp-peers" ? config.xpSharedGuildIds || "clear" : ""]];
  for (const [id, label, value] of fields) {
    const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(id === "servers" ? 1000 : 5);
    if (value) input.setValue(value);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }
  await interaction.showModal(modal);
  const submit = await interaction.awaitModalSubmit({ filter: (item) => item.customId === modalId && item.user.id === interaction.user.id, time: 120_000 }).catch(() => null);
  if (!submit) return config;
  await submit.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    if (!canManageServer(submit.member)) {
      await submit.editReply({ content: "You need Manage Server permission to save settings." });
      return config;
    }
    if (!await requireVerifiedOwnership(submit)) {
      await submit.editReply({ content: "The server owner must run /verify before setup can be saved." });
      return config;
    }
    let next = config;
    let content = "XP settings saved.";
    if (action === "xp-rewards") {
      const values = fields.map(([id]) => {
        const text = submit.fields.getTextInputValue(id).trim();
        if (!/^\d+$/.test(text)) throw new Error("Rewards and cooldown must be whole numbers.");
        return Number(text);
      });
      if (values.slice(0, 3).some((value) => value < 1 || value > 10000) || values[3] < 10 || values[3] > 3600) throw new Error("Rewards must be 1–10000 XP and cooldown 10–3600 seconds.");
      next = await update(submit.guildId, { xpMessageAmount: values[0], xpReactionAmount: values[1], xpDailyAmount: values[2], xpCooldownSeconds: values[3] });
    } else {
      const ids = parseSharedGuildIds(submit.fields.getTextInputValue("servers"));
      if (action === "xp-peers") {
        next = await update(submit.guildId, { xpSharedGuildIds: ids.filter((id) => id !== submit.guildId).join(",") });
      } else {
        if (ids.length === 0) throw new Error("Choose at least one target server.");
        const applied = await xpConfigurationService.apply(submit.client, submit.user.id, config, ids);
        next = await guildConfigService.getOrCreate(submit.guildId);
        content = `XP configuration applied to ${applied.length} servers.`;
      }
    }
    await root.editReply(renderer.buildScreen("xp", submit.guild, next, sessionId));
    await submit.editReply({ content });
    return next;
  } catch (error) {
    await submit.editReply({ content: error instanceof Error ? error.message : "Could not save XP settings." });
    return config;
  }
}
