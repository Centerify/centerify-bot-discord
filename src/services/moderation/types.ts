export const moderationActions = [
  "WARNING",
  "TIMEOUT",
  "KICK",
  "BAN",
  "UNBAN",
  "NOTE",
] as const;

export type ModerationAction = (typeof moderationActions)[number];

export const reportStatuses = ["PENDING", "ACCEPTED", "REJECTED"] as const;

export type ReportStatus = (typeof reportStatuses)[number];

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export type CreateModerationCaseInput = {
  guildId: string;
  targetUserId: string;
  moderatorUserId: string;
  action: ModerationAction;
  reason: string;
  durationMs?: number | null;
  metadata?: JsonValue | null;
};

export type CreateReportInput = {
  guildId: string;
  reportedUserId: string;
  reporterUserId: string;
  reason: string;
};
