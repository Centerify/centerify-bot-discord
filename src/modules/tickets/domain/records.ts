import { z } from "zod";

const snowflake = z.string().regex(/^\d{17,20}$/);
export const ticketSettingsSchema = z.object({
  enabled: z.boolean(),
  categoryId: snowflake,
  supportRoleId: snowflake,
});
export type TicketSettings = z.infer<typeof ticketSettingsSchema>;
export interface TicketRecord {
  botId: string;
  ownerId: string;
  supportRoleId: string;
  state: "open" | "closed";
}
export function ticketTopic(record: TicketRecord) {
  return `centerify-ticket:v1:${record.botId}:${record.ownerId}:${record.supportRoleId}:${record.state}`;
}
export function parseTicketTopic(topic: string | null): TicketRecord | null {
  const match = /^centerify-ticket:v1:(\d{17,20}):(\d{17,20}):(\d{17,20}):(open|closed)$/.exec(
    topic ?? "",
  );
  return match
    ? {
        botId: match[1]!,
        ownerId: match[2]!,
        supportRoleId: match[3]!,
        state: match[4] as TicketRecord["state"],
      }
    : null;
}
