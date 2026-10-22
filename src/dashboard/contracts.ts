import { z } from "zod";
import { ticketSettingsSchema } from "../modules/tickets/domain/records.js";

export const snowflake = z.string().regex(/^\d{17,20}$/, "Use a Discord ID");
export const themeSchema = z.enum(["dark", "night", "light", "system"]);
export const settingsPatchSchema = z
  .object({
    welcomeEnabled: z.boolean().optional(),
    welcomeChannelId: snowflake.nullable().optional(),
    welcomeMessage: z.string().min(1).max(2000).optional(),
    goodbyeEnabled: z.boolean().optional(),
    goodbyeChannelId: snowflake.nullable().optional(),
    goodbyeMessage: z.string().min(1).max(2000).optional(),
    autoRoleEnabled: z.boolean().optional(),
    autoRoleId: snowflake.nullable().optional(),
    loggingEnabled: z.boolean().optional(),
    loggingChannelId: snowflake.nullable().optional(),
    globalBanEnabled: z.boolean().optional(),
    globalWarnEnabled: z.boolean().optional(),
    globalNoteEnabled: z.boolean().optional(),
    ticketSettings: ticketSettingsSchema.optional(),
    warningRoleSettings: z.unknown().optional(),
    commandRoleAccess: z.unknown().optional(),
    xpEnabled: z.boolean().optional(),
    xpMethods: z
      .enum([
        "messages",
        "reactions",
        "daily",
        "messages,reactions",
        "messages,daily",
        "reactions,daily",
        "messages,reactions,daily",
      ])
      .optional(),
    xpMessageAmount: z.number().int().min(1).max(10000).optional(),
    xpReactionAmount: z.number().int().min(1).max(10000).optional(),
    xpDailyAmount: z.number().int().min(1).max(10000).optional(),
    xpCooldownSeconds: z.number().int().min(10).max(86400).optional(),
    xpSharing: z.enum(["server", "global", "selected"]).optional(),
    xpSharedGuildIds: z
      .string()
      .max(525)
      .refine(
        (s) =>
          !s || (s.split(",").length <= 25 && s.split(",").every((id) => /^\d{17,20}$/.test(id))),
      )
      .optional(),
  })
  .strict();
export const moderationSchema = z
  .object({
    action: z.enum([
      "warn",
      "unwarn",
      "ban",
      "unban",
      "kick",
      "timeout",
      "removetimeout",
      "note",
      "addrole",
      "removerole",
    ]),
    userIds: z.array(snowflake).min(1).max(20),
    reason: z.string().trim().min(3).max(1000),
    durationMs: z.number().int().min(60_000).max(2_419_200_000).optional(),
    roleId: snowflake.optional(),
    evidence: z
      .url({ protocol: /^https$/ })
      .max(500)
      .optional(),
    channelId: snowflake,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.action === "timeout" && !v.durationMs)
      ctx.addIssue({
        code: "custom",
        path: ["durationMs"],
        message: "A timeout duration is required",
      });
    if (["addrole", "removerole"].includes(v.action) && !v.roleId)
      ctx.addIssue({ code: "custom", path: ["roleId"], message: "Select a role" });
  });
export type Capability =
  "overview" | "moderation" | "tickets" | "settings" | "commands" | "plugins" | "operator";
export interface DashboardGuild {
  id: string;
  name: string;
  icon: string | null;
  installed: boolean;
  verified: boolean;
  capabilities: Capability[];
  memberCount: number;
}
export interface LiveEvent {
  id: number;
  guildId: string;
  actorId: string | null;
  type: string;
  summary: string;
  data: unknown;
  createdAt: string;
}
export class DashboardError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
