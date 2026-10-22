import {
  ChannelType,
  PermissionFlagsBits as P,
  PermissionsBitField,
  type Guild,
  type GuildMember,
} from "discord.js";
import { parseTicketTopic, ticketTopic } from "../modules/tickets/domain/records.js";
import { ticketOverwrites } from "../modules/tickets/discord/runtime.js";
import { DashboardError } from "./contracts.js";

export async function authorizedTicket(guild: Guild, actor: GuildMember, channelId: string) {
  const channel = await guild.channels.fetch(channelId, { force: true });
  if (!channel || channel.type !== ChannelType.GuildText)
    throw new DashboardError(404, "Ticket channel not found");
  const record = parseTicketTopic(channel.topic);
  if (!record || record.botId !== guild.members.me?.id)
    throw new DashboardError(
      404,
      "This channel is not a built-in Centerify ticket. Better Ticket has its own plugin workflow.",
    );
  if (!channel.permissionsFor(actor)?.has([P.ViewChannel, P.ReadMessageHistory]))
    throw new DashboardError(403, "You cannot view this ticket conversation");
  const staff =
    actor.id === guild.ownerId ||
    actor.permissions.has(P.ManageChannels) ||
    actor.roles.cache.has(record.supportRoleId);
  if (!staff) throw new DashboardError(403, "Ticket support staff access is required");
  return { channel, record };
}
/** Shared channel action used by the dashboard and bot workflow runtime. Topics remain authoritative. */
export async function changeTicketState(
  guild: Guild,
  actor: GuildMember,
  channelId: string,
  state: "open" | "closed",
) {
  const { channel, record } = await authorizedTicket(guild, actor, channelId);
  const me = await guild.members.fetchMe({ force: true });
  if (!channel.permissionsFor(me)?.has([P.ManageChannels, P.ManageRoles]))
    throw new DashboardError(
      403,
      "Centerify needs Manage Channels and Manage Roles in this ticket",
    );
  if (record.state === state) return { channelId, state };
  const deny = [
    P.SendMessages,
    P.SendMessagesInThreads,
    P.CreatePublicThreads,
    P.CreatePrivateThreads,
    P.AddReactions,
  ];
  const overwrites =
    state === "open"
      ? ticketOverwrites(guild.id, { ...record, state })
      : channel.permissionOverwrites.cache.map((o) => ({
          id: o.id,
          type: o.type,
          allow: o.id === me.id ? o.allow : new PermissionsBitField(o.allow).remove(deny),
          deny: o.id === me.id ? o.deny : new PermissionsBitField(o.deny).add(deny),
        }));
  await channel.edit({
    topic: ticketTopic({ ...record, state }),
    permissionOverwrites: overwrites,
    reason: `Centerify dashboard ticket ${state} by ${actor.id}`,
  });
  return { channelId, state };
}
