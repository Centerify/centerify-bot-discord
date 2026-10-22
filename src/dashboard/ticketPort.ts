import type { Guild, GuildMember } from "discord.js";
import { serviceToken } from "../core/index.js";
export interface TicketSummary {
  id: string;
  name: string;
  ownerId: string;
  supportRoleId: string;
  state: "open" | "closed";
  createdAt: string;
  source?: string;
  number?: number;
  department?: string;
  priority?: string;
  claimedBy?: string | null;
  tags?: string[];
  status?: string;
}
export interface TicketDetails extends TicketSummary {
  messages: {
    id: string;
    author: string;
    authorId: string;
    content: string;
    createdAt: string;
    attachments: { name: string; url: string }[];
    embeds: { title: string | null; description: string | null }[];
  }[];
  truncated: boolean;
  notes?: { by: string; text: string; at: number }[];
  transcript?: { url: string; truncated: boolean } | null;
}
/** Trusted plugins implement their own staff and channel checks on every call. */
export interface TicketDashboardPort {
  id: string;
  supports(guild: Guild, actor: GuildMember): Promise<boolean>;
  list(guild: Guild, actor: GuildMember): Promise<TicketSummary[]>;
  read(guild: Guild, actor: GuildMember, channelId: string): Promise<TicketDetails | null>;
  mutate(guild: Guild, actor: GuildMember, channelId: string, input: unknown): Promise<unknown>;
  profiles(guild: Guild, actor: GuildMember): Promise<unknown>;
  configure(guild: Guild, actor: GuildMember, input: unknown): Promise<unknown>;
}
export const ticketDashboardToken = serviceToken<TicketDashboardPort>("dashboard.ticketPorts");
