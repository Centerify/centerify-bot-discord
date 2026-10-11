import type { SapphireClient } from "@sapphire/framework";
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, EmbedBuilder,
  MessageFlags, RoleSelectMenuBuilder, StringSelectMenuBuilder, type Guild,
} from "discord.js";
import { commandRoleAccess, PROTECTED_ACCESS_COMMANDS, GuildSettingsError, type GuildConfig, type GuildConfigUpdate } from "../../guilds/index.js";
import type { SetupComponentInteraction, SetupView } from "./types.js";

export function configurableCommands(guild: Guild): string[] {
  const client = guild.client as SapphireClient;
  return [...(client?.stores?.get("commands").keys() ?? [])]
    .filter((name) => !PROTECTED_ACCESS_COMMANDS.some((protectedName) => protectedName === name)).sort();
}

export function buildCommandAccessScreen(guild: Guild, config: GuildConfig, session: string, selected?: string, page = 0): SetupView {
  const commands = configurableCommands(guild);
  const totalPages = Math.max(1, Math.ceil(commands.length / 25));
  page = Math.max(0, Math.min(page, totalPages - 1));
  const options = commands.slice(page * 25, (page + 1) * 25);
  const name = selected && commands.includes(selected) ? selected : options[0];
  const rule = commandRoleAccess(config.commandRoleAccess)[name ?? ""] ?? { allowedRoleIds: [], deniedRoleIds: [] };
  const prefix = `setup:${session}:`;
  const button = (action: string, label: string) => new ButtonBuilder().setCustomId(prefix + action).setLabel(label).setStyle(ButtonStyle.Secondary);
  const roleList = (ids: string[], empty: string) => ids.length ? ids.map((id) => `<@&${id}>`).join(" ") : empty;
  const rows: Array<ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder | RoleSelectMenuBuilder>> = [new ActionRowBuilder<ButtonBuilder>().addComponents(
    button("command-access-prev", "Previous commands").setDisabled(page === 0),
    button("command-access-next", "Next commands").setDisabled(page + 1 >= totalPages),
    button(`command-access-clear:${name ?? "none"}`, "Reset access").setDisabled(!name),
    button("main", "Back"),
  )];
  if (options.length) rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder()
    .setCustomId(prefix + "command-access-pick").setPlaceholder("Choose a command")
    .addOptions(options.map((value) => ({ label: `/${value}`, value, default: value === name })))));
  if (name) for (const [key, label] of [["allowedRoleIds", "Allowed roles (empty means unrestricted)"], ["deniedRoleIds", "Denied roles (deny takes priority)"]] as const) {
    rows.push(new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(new RoleSelectMenuBuilder()
      .setCustomId(`${prefix}command-access-${key}:${name}`).setPlaceholder(label)
      .setMinValues(0).setMaxValues(25).setDefaultRoles(rule[key])));
  }
  return {
    embeds: [new EmbedBuilder().setColor(Colors.Blurple).setTitle("Command Role Access")
      .setDescription(`${name ? `**Slash command:** /${name}\n**Allowed:** ${roleList(rule.allowedRoleIds, "Any role")}\n**Denied:** ${roleList(rule.deniedRoleIds, "None")}` : "No configurable commands are enabled."}\n\n` +
        "Allowed lists require at least one matching role. Denied roles take priority, including for administrators. Commands still require their normal Discord permissions. Settings, setup and verification keep their normal access so configuration stays available. For individual custom commands, use /custom configure → Access rules.")
      .setFooter({ text: `Commands page ${page + 1}/${totalPages} • Changes save immediately` })],
    components: rows, allowedMentions: { parse: [] },
  };
}

export class CommandAccessEditor {
  private selected: string | undefined;
  private page = 0;
  async handle(interaction: SetupComponentInteraction, config: GuildConfig, session: string,
    update: (id: string, data: GuildConfigUpdate) => Promise<GuildConfig>): Promise<GuildConfig> {
    const action = interaction.customId.split(":")[2];
    const commands = configurableCommands(interaction.guild);
    const pages = Math.max(1, Math.ceil(commands.length / 25));
    try {
      if (action === "command-access") { this.page = 0; this.selected = commands[0]; }
      else if (action === "command-access-prev" && interaction.isButton()) this.page = Math.max(0, this.page - 1);
      else if (action === "command-access-next" && interaction.isButton()) this.page = Math.min(pages - 1, this.page + 1);
      else if (action === "command-access-pick" && interaction.isStringSelectMenu()) {
        if (interaction.values.length !== 1 || !commands.includes(interaction.values[0])) throw new GuildSettingsError("Choose an enabled command.");
        this.selected = interaction.values[0];
      } else {
        const name = interaction.customId.split(":")[3];
        if (!name || !commands.includes(name)) throw new GuildSettingsError("Choose an enabled command.");
        this.selected = name;
        const access = commandRoleAccess(config.commandRoleAccess);
        if (action === "command-access-clear" && interaction.isButton()) delete access[name];
        else if (interaction.isRoleSelectMenu() && ["command-access-allowedRoleIds", "command-access-deniedRoleIds"].includes(action)) {
          if (interaction.values.length > 25) throw new GuildSettingsError("Select at most 25 roles.");
          await interaction.guild.roles.fetch();
          if (interaction.values.some((id) => !interaction.guild.roles.cache.has(id))) throw new GuildSettingsError("Select roles that belong to this server.");
          const key = action === "command-access-allowedRoleIds" ? "allowedRoleIds" : "deniedRoleIds";
          access[name] = { ...(access[name] ?? { allowedRoleIds: [], deniedRoleIds: [] }), [key]: interaction.values };
        } else throw new GuildSettingsError("Choose a valid access setting.");
        config = await update(interaction.guildId, { commandRoleAccess: commandRoleAccess(access) });
      }
      await interaction.editReply(buildCommandAccessScreen(interaction.guild, config, session, this.selected, this.page));
    } catch (error) {
      await interaction.followUp({ content: error instanceof GuildSettingsError ? error.message : "Could not save command access.",
        flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }
    return config;
  }
}
