import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, EmbedBuilder, MessageFlags,
  ModalBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
  type Guild, type ModalSubmitInteraction,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { warningRoleSettings, GuildSettingsError, type GuildConfig, type GuildConfigUpdate } from "../../guilds/index.js";
import { canManageServer, requireVerifiedOwnership, validateAssignableRole } from "../../guilds/discord/index.js";
import { parseDuration, formatDuration } from "../../moderation/discord/index.js";
import type { SetupComponentInteraction, SetupView } from "./types.js";

export function buildWarningRoleScreen(guild: Guild, config: GuildConfig, session: string): SetupView {
  const settings = warningRoleSettings(config.warningRoleSettings);
  const prefix = `setup:${session}:`;
  const button = (action: string, label: string, style = ButtonStyle.Secondary) =>
    new ButtonBuilder().setCustomId(prefix + action).setLabel(label).setStyle(style);
  return {
    embeds: [new EmbedBuilder().setColor(settings.color || Colors.Blurple).setTitle("Warning Roles")
      .setDescription(
        `**Mode:** ${settings.mode}\n**Numbered name:** ${settings.numberedName}\n` +
        `**Shared role:** ${settings.singleRoleId ? `<@&${settings.singleRoleId}>` : settings.singleName}\n` +
        `**Color:** #${settings.color.toString(16).padStart(6, "0")}\n` +
        `**Default duration:** ${settings.defaultDurationMs ? formatDuration(settings.defaultDurationMs) : "Permanent"}\n\n` +
        "Numbered mode adds a role for each warning count. Shared mode uses one role until the last active warning ends. No Role records warnings without assigning roles. Styles apply when a warning role is next used. Existing warnings keep their original role and expiration.")],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder()
        .setCustomId(prefix + "warning-mode").setPlaceholder("Choose warning role behavior").addOptions([
          { label: "Numbered roles", value: "numbered", default: settings.mode === "numbered" },
          { label: "One shared role", value: "single", default: settings.mode === "single" },
          { label: "No role", value: "none", default: settings.mode === "none" },
        ])),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button("warning-edit", "Names, color & duration", ButtonStyle.Primary),
        button("warning-hoist", settings.hoist ? "Separate display: On" : "Separate display: Off"),
        button("warning-mentionable", settings.mentionable ? "Mentionable: On" : "Mentionable: Off"),
        button("main", "Back"),
      ),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(new RoleSelectMenuBuilder()
        .setCustomId(prefix + "warning-single-role").setPlaceholder("Choose an existing shared warning role (optional)")
        .setMinValues(0).setMaxValues(1).setDefaultRoles(settings.singleRoleId ? [settings.singleRoleId] : [])),
    ], allowedMentions: { parse: [] },
  };
}

export async function handleWarningSettings(
  interaction: SetupComponentInteraction, config: GuildConfig, session: string,
  update: (id: string, data: GuildConfigUpdate) => Promise<GuildConfig>,
): Promise<GuildConfig> {
  const action = interaction.customId.split(":")[2];
  const settings = warningRoleSettings(config.warningRoleSettings);
  let submission: ModalSubmitInteraction<"cached"> | undefined;
  try {
    if (action === "warning-edit" && interaction.isButton()) {
      const id = `warning-settings:${session}:${randomUUID()}`;
      const modal = new ModalBuilder().setCustomId(id).setTitle("Warning role settings");
      for (const [key, label, value, max] of [
        ["numberedName", "Numbered name (must include {count})", settings.numberedName, 80],
        ["singleName", "New shared role name", settings.singleName, 80],
        ["color", "Role color (#ff0000 or a Discord color name)", `#${settings.color.toString(16).padStart(6, "0")}`, 40],
        ["duration", "Default duration: permanent or 1m–28d", durationInput(settings.defaultDurationMs), 20],
      ] as const) {
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
          .setCustomId(key).setLabel(label).setValue(value).setMaxLength(max).setRequired(true).setStyle(TextInputStyle.Short)));
      }
      await interaction.showModal(modal);
      const reply = await interaction.awaitModalSubmit({ time: 90_000, filter: (candidate) =>
        candidate.customId === id && candidate.user.id === interaction.user.id && candidate.guildId === interaction.guildId,
      }).catch(() => null);
      if (!reply || !reply.inCachedGuild()) return config;
      submission = reply;
      await reply.deferReply({ flags: MessageFlags.Ephemeral });
      const member = await reply.guild.members.fetch({ user: reply.user.id, force: true });
      if (!canManageServer(member)) {
        await reply.editReply("You need Manage Server permission to change warning settings.");
        return config;
      }
      if (!await requireVerifiedOwnership(reply)) return config;
      const field = (key: string) => reply.fields.getTextInputValue(key).trim();
      const color = field("color");
      const namedColor = Object.entries(Colors).find(([key]) => key.toLowerCase() === color.toLowerCase());
      if (!/^#[\da-f]{6}$/i.test(color) && !namedColor) throw new GuildSettingsError("Use a hex color such as #ff0000 or a Discord color name such as Orange.");
      const duration = field("duration").toLowerCase();
      const durationMs = duration === "permanent" ? null : parseDuration(duration);
      if (duration !== "permanent" && durationMs === null) throw new GuildSettingsError("Use permanent or a duration between 1m and 28d.");
      Object.assign(settings, { numberedName: field("numberedName"), singleName: field("singleName"),
        color: namedColor?.[1] ?? parseInt(color.slice(1), 16), defaultDurationMs: durationMs });
    } else if (action === "warning-mode" && interaction.isStringSelectMenu() && interaction.values.length === 1) {
      settings.mode = interaction.values[0] as typeof settings.mode;
    } else if (action === "warning-hoist" && interaction.isButton()) settings.hoist = !settings.hoist;
    else if (action === "warning-mentionable" && interaction.isButton()) settings.mentionable = !settings.mentionable;
    else if (action === "warning-single-role" && interaction.isRoleSelectMenu()) {
      if (interaction.values.length > 1) throw new GuildSettingsError("Choose at most one shared warning role.");
      const id = interaction.values[0] ?? null;
      if (id) {
        const role = await interaction.guild.roles.fetch(id);
        const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
        const error = !role ? "That role no longer exists." : validateAssignableRole(interaction.guild, role);
        if (error) throw new GuildSettingsError(error);
        if (member.id !== interaction.guild.ownerId && role!.comparePositionTo(member.roles.highest) >= 0)
          throw new GuildSettingsError("The warning role must be below your highest role.");
      }
      settings.singleRoleId = id;
    } else throw new GuildSettingsError("Choose a valid warning setting.");
    const next = await update(interaction.guildId, { warningRoleSettings: warningRoleSettings(settings) });
    if (submission) await submission.editReply("Warning settings saved.");
    return next;
  } catch (error) {
    const content = error instanceof GuildSettingsError ? error.message : "Could not save warning settings.";
    if (submission) await submission.editReply({ content, allowedMentions: { parse: [] } });
    else await interaction.followUp({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    return config;
  }
}

function durationInput(duration: number | null): string {
  if (duration === null) return "permanent";
  if (duration % 86_400_000 === 0) return `${duration / 86_400_000}d`;
  if (duration % 3_600_000 === 0) return `${duration / 3_600_000}h`;
  return `${duration / 60_000}m`;
}
