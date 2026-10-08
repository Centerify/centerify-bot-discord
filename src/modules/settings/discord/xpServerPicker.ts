import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  MessageFlags, type ButtonInteraction, type Client,
} from "discord.js";
import type { Command } from "@sapphire/framework";
import { guildConfigService, type GuildConfig, type GuildConfigUpdate } from "../../guilds/discord/index.js";
import { requireVerifiedOwnership } from "../../guilds/discord/index.js";
import { xpConfigurationService } from "../../xp/discord/index.js";
import { canManageServer } from "../../guilds/discord/index.js";
import type { SetupRenderer } from "./renderer.js";

export type XpServerChoice = { id: string; name: string };

export async function discoverXpServers(client: Client, userId: string, sourceId: string, managedOnly: boolean) {
  const guilds = [...client.guilds.cache.values()].filter((guild) => guild.id !== sourceId);
  const choices: XpServerChoice[] = [];
  // Limit concurrent member requests on bots that belong to many servers.
  for (let offset = 0; offset < guilds.length; offset += 5) {
    const batch = await Promise.all(guilds.slice(offset, offset + 5).map(async (guild) => {
      const member = await guild.members.fetch(userId).catch(() => null);
      return member && (!managedOnly || canManageServer(member)) ? { id: guild.id, name: guild.name } : null;
    }));
    choices.push(...batch.filter((item): item is XpServerChoice => item !== null));
  }
  return choices.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function pickerView(choices: XpServerChoice[], selected: Set<string>, page: number, prefix: string, apply: boolean) {
  const pages = Math.max(1, Math.ceil(choices.length / 25));
  const visible = choices.slice(page * 25, (page + 1) * 25);
  const button = (action: string, label: string, style = ButtonStyle.Secondary) =>
    new ButtonBuilder().setCustomId(`${prefix}:${action}`).setLabel(label).setStyle(style);
  const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
  if (visible.length) components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`${prefix}:select`).setPlaceholder("Choose servers by name")
      .setMinValues(0).setMaxValues(visible.length).addOptions(visible.map((item) => ({
        label: item.name.slice(0, 100), value: item.id, description: `Server ID: ${item.id}`,
        default: selected.has(item.id),
      }))),
  ));
  components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    button("previous", "Previous").setDisabled(page === 0),
    button("next", "Next").setDisabled(page >= pages - 1),
    button("clear", "Clear Selection").setDisabled(selected.size === 0),
    button("save", apply ? "Apply to Selected" : "Save Servers", ButtonStyle.Success).setDisabled(apply && selected.size === 0),
    button("cancel", "Cancel"),
  ));
  const names = [...selected].map((id) => choices.find((item) => item.id === id)?.name ?? `Server ${id}`);
  const summary = names.length ? names.map((name) => name.replace(/[\\`*_~|<>@\r\n]/g, "").slice(0, 40)).join(", ") : "None";
  return {
    content: `**${apply ? "Apply XP to Servers" : "Choose XP Sharing Servers"}**\n` +
      (apply ? "Shows servers you manage where Centerify is installed. Applying replaces their XP settings with this server's settings. Owners must verify first.\n"
        : "Shows your servers where Centerify is installed. Saving enables selected sharing here. Each other server must enable XP, choose selected sharing, and select this server too.\n") +
      `\n**Selected (${selected.size}/${apply ? 24 : 25}):** ${summary}\nPage ${page + 1}/${pages}. Selections are kept when changing pages.\n` +
      (choices.length ? "Review your selection, then save. Changes are saved only when you confirm." : "No servers found. Add Centerify to another server, or enter IDs in XP settings."),
    components, allowedMentions: { parse: [] as [] },
  };
}

export function changePageSelection(selected: Set<string>, visible: XpServerChoice[], values: string[], limit: number) {
  if (values.some((id) => !visible.some((choice) => choice.id === id))) throw new Error("Choose servers from the current page.");
  const next = new Set(selected);
  for (const choice of visible) next.delete(choice.id);
  for (const id of values) next.add(id);
  if (next.size > limit) throw new Error(`Choose at most ${limit} other servers. Deselect a server or clear the selection first.`);
  return next;
}

export async function handleXpServerPicker(
  interaction: ButtonInteraction<"cached">,
  root: Command.ChatInputCommandInteraction<"cached">,
  config: GuildConfig, sessionId: string, apply: boolean, renderer: SetupRenderer,
  update: (guildId: string, data: GuildConfigUpdate) => Promise<GuildConfig>,
  onSaved?: (config: GuildConfig) => Promise<void>,
) {
  if (!interaction.deferred) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const choices = await discoverXpServers(interaction.client, interaction.user.id, interaction.guildId, apply);
  let selected = new Set(apply ? [] : config.xpSharedGuildIds.split(",").filter((id) => id && id !== interaction.guildId));
  let page = 0;
  const prefix = `xp-picker:${interaction.id}`;
  const message = await interaction.editReply(pickerView(choices, selected, page, prefix, apply));
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const item = await message.awaitMessageComponent({
      filter: (item) => item.user.id === interaction.user.id && item.customId.startsWith(`${prefix}:`),
      time: Math.max(1, deadline - Date.now()),
    }).catch(() => null);
    if (!item) break;
    await item.deferUpdate();
    const action = item.customId.slice(prefix.length + 1);
    if (action === "cancel") {
      await interaction.editReply({ content: "Cancelled. XP settings were not changed.", components: [] });
      return config;
    }
    try {
      if (action === "select" && item.isStringSelectMenu()) {
        selected = changePageSelection(selected, choices.slice(page * 25, (page + 1) * 25), item.values, apply ? 24 : 25);
      } else if (action === "clear") selected.clear();
      else if (action === "previous") page = Math.max(0, page - 1);
      else if (action === "next") page = Math.min(Math.max(0, Math.ceil(choices.length / 25) - 1), page + 1);
      else if (action === "save") {
        if (!item.inCachedGuild() || !canManageServer(item.member)) throw new Error("You need Manage Server permission to save XP settings.");
        if (!await requireVerifiedOwnership(item)) {
          await interaction.editReply({ content: "The server owner must run /verify before saving XP settings.", components: [] });
          return config;
        }
        let next: GuildConfig;
        if (apply) {
          if (!selected.size) throw new Error("Choose at least one server.");
          await xpConfigurationService.apply(item.client, item.user.id, config, [...selected]);
          next = await guildConfigService.getOrCreate(item.guildId);
        } else next = await update(item.guildId, { xpSharing: "selected", xpSharedGuildIds: [...selected].join(",") });
        if (onSaved) await onSaved(next);
        else await root.editReply(renderer.buildScreen("xp", interaction.guild, next, sessionId));
        await interaction.editReply({ content: apply ? `XP settings applied to ${selected.size} other servers.` : "Sharing servers saved. Other servers must also select this server and enable XP for sharing to work.", components: [] });
        return next;
      }
      await interaction.editReply(pickerView(choices, selected, page, prefix, apply));
    } catch (error) {
      await item.followUp({ content: error instanceof Error ? error.message : "Could not save XP settings. Try again.", flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }
  }
  await interaction.editReply({ content: "Server selection expired. Open the server picker again; no changes were saved.", components: [] });
  return config;
}
