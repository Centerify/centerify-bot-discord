import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  OverwriteType,
  PermissionFlagsBits as P,
  PermissionsBitField,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type OverwriteResolvable,
  type TextChannel,
} from "discord.js";
import { serviceRef } from "../../../adapters/discord/context.js";
import { logger } from "../../../adapters/logging/runtime.js";
import { commandRoleDenial } from "../../guilds/index.js";
import { guildConfigService, requireVerifiedOwnership } from "../../guilds/discord/index.js";
import { ticketLocksToken } from "../index.js";
import {
  parseTicketTopic,
  ticketSettingsSchema,
  ticketTopic,
  type TicketRecord,
} from "../domain/records.js";

export const OPEN_TICKET_BUTTON = "centerify:ticket:open:v1";
class TicketError extends Error {}
const read = [P.ViewChannel, P.ReadMessageHistory];
const write = [P.SendMessages, P.AttachFiles, P.EmbedLinks];
const closedDeny = [
  P.SendMessages,
  P.SendMessagesInThreads,
  P.CreatePublicThreads,
  P.CreatePrivateThreads,
  P.AddReactions,
];
// Discord only permits overwrites for permissions held by the bot. Include
// denied thread permissions as well as permissions granted to participants.
const botPermissions = [
  ...new Set([P.ManageChannels, P.ManageRoles, ...read, ...write, ...closedDeny]),
];

function requireStaff(actor: GuildMember, guild: Guild, supportRoleId?: string) {
  if (
    actor.id !== guild.ownerId &&
    !actor.permissions.has(P.ManageChannels) &&
    !(supportRoleId && actor.roles.cache.has(supportRoleId))
  )
    throw new TicketError("Only ticket support staff can do that.");
}

export function ticketOverwrites(guildId: string, record: TicketRecord): OverwriteResolvable[] {
  return [
    { id: guildId, type: OverwriteType.Role, deny: [P.ViewChannel, ...closedDeny] },
    {
      id: record.ownerId,
      type: OverwriteType.Member,
      allow: [...read, ...write],
      deny: [P.CreatePublicThreads, P.CreatePrivateThreads],
    },
    {
      id: record.supportRoleId,
      type: OverwriteType.Role,
      allow: [...read, ...write],
      deny: [P.CreatePublicThreads, P.CreatePrivateThreads],
    },
    { id: record.botId, type: OverwriteType.Member, allow: botPermissions },
  ];
}

export async function runTicket(input: ChatInputCommandInteraction | ButtonInteraction) {
  if (!input.deferred && !input.replied) await input.deferReply({ flags: MessageFlags.Ephemeral });
  let lockKey: string | undefined;
  let locks: Set<string> | undefined;
  try {
    if (!input.inCachedGuild()) throw new TicketError("Use tickets inside a server.");
    if (!(await requireVerifiedOwnership(input))) return;
    const guild = input.guild;
    const [actor, bot, config] = await Promise.all([
      guild.members.fetch({ user: input.user.id, force: true }),
      guild.members.fetchMe({ force: true }),
      guildConfigService.getOrCreate(guild.id),
    ]);
    const denial = commandRoleDenial(
      config.commandRoleAccess,
      "ticket",
      new Set(actor.roles.cache.keys()),
    );
    if (denial) throw new TicketError(denial);
    const button = input.isButton();
    if (button && (input.customId !== OPEN_TICKET_BUTTON || input.message.author.id !== bot.id))
      throw new TicketError("This is not a Centerify ticket panel.");
    const action = button ? "open" : input.options.getSubcommand();
    const parsedSettings = ticketSettingsSchema.safeParse(config.ticketSettings);
    const settings = parsedSettings.success ? parsedSettings.data : null;
    const respond = async (content: string) => {
      await input.editReply({ content, allowedMentions: { parse: [] } });
    };

    if (action === "setup" || action === "disable" || action === "panel") {
      if (actor.id !== guild.ownerId && !actor.permissions.has(P.ManageGuild))
        throw new TicketError(
          "You need Manage Server permission to configure tickets or publish panels.",
        );
      if (button) throw new TicketError("Use /ticket for ticket configuration.");
      if (action === "disable") {
        if (!settings) throw new TicketError("Tickets are not configured yet.");
        await guildConfigService.update(guild.id, {
          ticketSettings: { ...settings, enabled: false },
        });
        await respond("New tickets are disabled. Existing tickets can still be managed.");
        return;
      }
      if (action === "setup") {
        const category = await guild.channels.fetch(input.options.getChannel("category", true).id);
        const role = await guild.roles.fetch(input.options.getRole("support_role", true).id);
        if (!category || category.type !== ChannelType.GuildCategory)
          throw new TicketError("Choose a category in this server.");
        if (!role || role.id === guild.id || role.managed)
          throw new TicketError(
            "Choose a dedicated support role, not everyone or an integration role.",
          );
        if (
          role.comparePositionTo(bot.roles.highest) >= 0 ||
          (actor.id !== guild.ownerId && role.comparePositionTo(actor.roles.highest) >= 0)
        )
          throw new TicketError("The support role must be below both your highest role and mine.");
        if (
          !category.permissionsFor(actor)?.has([P.ViewChannel, P.ManageChannels]) ||
          !bot.permissions.has(botPermissions) ||
          !category.permissionsFor(bot)?.has(botPermissions)
        )
          throw new TicketError(
            "You need View Channel and Manage Channels in that category. I need channel and role management, messaging, history, attachments, embeds, reactions and thread permissions.",
          );
        await guildConfigService.update(guild.id, {
          ticketSettings: { enabled: true, categoryId: category.id, supportRoleId: role.id },
        });
        await respond(
          "Tickets configured. Use /ticket panel to publish a button, or /ticket open to create a ticket.",
        );
        return;
      }
      if (!settings?.enabled) throw new TicketError("Run /ticket setup before publishing a panel.");
      const channel = await guild.channels.fetch(input.options.getChannel("channel", true).id);
      if (
        !channel ||
        channel.type !== ChannelType.GuildText ||
        !channel.permissionsFor(actor)?.has([P.ViewChannel, P.SendMessages]) ||
        !channel.permissionsFor(bot)?.has([P.ViewChannel, P.SendMessages])
      )
        throw new TicketError(
          "Choose a text channel where both you and I can view and send messages.",
        );
      await channel.send({
        content:
          input.options.getString("message") ||
          "Need help? Open a private ticket with our support team.",
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(OPEN_TICKET_BUTTON)
              .setLabel("Open ticket")
              .setStyle(ButtonStyle.Primary),
          ),
        ],
        allowedMentions: { parse: [] },
      });
      await respond(`Published a ticket panel in <#${channel.id}>.`);
      return;
    }

    locks = serviceRef(ticketLocksToken);
    lockKey =
      action === "open" ? `${guild.id}:open:${actor.id}` : `${guild.id}:channel:${input.channelId}`;
    if (locks.has(lockKey)) {
      lockKey = undefined;
      throw new TicketError("Another ticket action is in progress. Please try again shortly.");
    }
    locks.add(lockKey);
    if (action === "open") {
      if (!settings?.enabled)
        throw new TicketError("Tickets are disabled. Ask server staff to run /ticket setup.");
      const channels = await guild.channels.fetch();
      const existing = channels.find((channel) => {
        if (channel?.type !== ChannelType.GuildText) return false;
        const record = parseTicketTopic(channel.topic);
        return record?.botId === bot.id && record.ownerId === actor.id && record.state === "open";
      });
      if (existing) {
        await respond(`You already have an open ticket: <#${existing.id}>.`);
        return;
      }
      const category = channels.get(settings.categoryId);
      const support = await guild.roles.fetch(settings.supportRoleId);
      if (
        !category ||
        category.type !== ChannelType.GuildCategory ||
        !support ||
        support.id === guild.id ||
        support.managed
      )
        throw new TicketError(
          "The ticket category or support role is unavailable. Ask staff to run /ticket setup again.",
        );
      if (
        !bot.permissions.has(botPermissions) ||
        !category.permissionsFor(bot)?.has(botPermissions)
      )
        throw new TicketError(
          "I need channel and role management, messaging, history, attachments, embeds, reactions and thread permissions to open tickets.",
        );
      const record: TicketRecord = {
        botId: bot.id,
        ownerId: actor.id,
        supportRoleId: support.id,
        state: "open",
      };
      const channel = await guild.channels.create({
        name: `ticket-${actor.id}`,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: ticketTopic(record),
        permissionOverwrites: ticketOverwrites(guild.id, record),
        reason: `Centerify ticket opened by ${actor.id}`,
      });
      // The channel and topic are the durable record, even if the welcome send fails.
      try {
        const subject = button ? null : input.options.getString("subject");
        await channel.send({
          content: `<@${actor.id}> Your support ticket is open.${subject ? `\n\n${subject}` : ""}\n\nUse /ticket close when resolved.`,
          allowedMentions: { parse: [] },
        });
      } catch (error) {
        logger.error(
          { err: error, guildId: guild.id, channelId: channel.id },
          "Ticket created but welcome delivery failed",
        );
      }
      await respond(`Your private ticket is ready: <#${channel.id}>.`);
      return;
    }

    const fetched = await guild.channels.fetch(input.channelId, { force: true });
    if (!fetched || fetched.type !== ChannelType.GuildText)
      throw new TicketError("Use this command inside a ticket channel.");
    const channel: TextChannel = fetched;
    const record = parseTicketTopic(channel.topic);
    if (!record || record.botId !== bot.id)
      throw new TicketError("This channel is not a Centerify ticket.");
    if (button) throw new TicketError("Use /ticket to manage this ticket.");
    if (action !== "close" || actor.id !== record.ownerId)
      requireStaff(actor, guild, record.supportRoleId);
    if (!channel.permissionsFor(actor)?.has(P.ViewChannel))
      throw new TicketError("You cannot manage a ticket you cannot view.");
    if (!channel.permissionsFor(bot)?.has(botPermissions))
      throw new TicketError(
        "I need Manage Channels and Manage Roles in this ticket to change access.",
      );
    if (action === "delete") {
      if (record.state !== "closed") throw new TicketError("Close the ticket before deleting it.");
      if (input.options.getBoolean("confirm", true) !== true)
        throw new TicketError(
          "Deletion cancelled. Set confirm to true to permanently delete this ticket and its messages.",
        );
      await respond("Deleting this closed ticket and its message history.");
      await channel.delete(`Centerify ticket deleted by ${actor.id}`);
      return;
    }
    if (record.state !== "open") throw new TicketError("This ticket is already closed.");
    if (action === "close") {
      const overwrites = channel.permissionOverwrites.cache.map((overwrite) => {
        if (overwrite.id === bot.id)
          return {
            id: overwrite.id,
            type: overwrite.type,
            allow: overwrite.allow,
            deny: overwrite.deny,
          };
        return {
          id: overwrite.id,
          type: overwrite.type,
          allow: new PermissionsBitField(overwrite.allow).remove(closedDeny),
          deny: new PermissionsBitField(overwrite.deny).add(closedDeny),
        };
      });
      await channel.edit({
        topic: ticketTopic({ ...record, state: "closed" }),
        permissionOverwrites: overwrites,
        reason: `Centerify ticket closed by ${actor.id}`,
      });
      await respond(
        "Ticket closed. The channel and message history are preserved for participants and support staff.",
      );
      return;
    }
    const target = await guild.members.fetch({
      user: input.options.getUser("member", true).id,
      force: true,
    });
    if (target.id === bot.id || target.id === record.ownerId)
      throw new TicketError("You cannot change access for the ticket owner or the bot.");
    if (
      action === "remove" &&
      (target.permissions.has(P.Administrator) || target.roles.cache.has(record.supportRoleId))
    )
      throw new TicketError(
        "Support staff and administrators retain ticket access through their roles.",
      );
    if (action === "add")
      await channel.permissionOverwrites.edit(
        target,
        {
          ViewChannel: true,
          ReadMessageHistory: true,
          SendMessages: true,
          AttachFiles: true,
          EmbedLinks: true,
          CreatePublicThreads: false,
          CreatePrivateThreads: false,
        },
        { reason: `Centerify ticket participant added by ${actor.id}` },
      );
    else
      await channel.permissionOverwrites.edit(
        target,
        { ViewChannel: false, SendMessages: false, ReadMessageHistory: false },
        { reason: `Centerify ticket participant removed by ${actor.id}` },
      );
    await respond(
      `${action === "add" ? "Added" : "Removed"} <@${target.id}> ${action === "add" ? "to" : "from"} this ticket.`,
    );
  } catch (error) {
    if (!(error instanceof TicketError))
      logger.error({ err: error, guildId: input.guildId }, "Ticket action failed");
    await input.editReply({
      content:
        error instanceof TicketError
          ? error.message
          : "I could not complete that ticket action. Check my channel permissions and role position, then try again.",
      allowedMentions: { parse: [] },
    });
  } finally {
    if (lockKey) locks?.delete(lockKey);
  }
}
