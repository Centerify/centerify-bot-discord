export type CustomResponseKind = "command" | "member_join" | "member_leave";
export interface CustomResponse {
  id: number; guildId: string; name: string; kind: string; trigger: string; response: string;
  channelId: string | null; allowedRoleId: string | null; adminOnly: boolean; exactMatch: boolean;
  embed: boolean; cooldownSeconds: number; enabled: boolean; createdBy: string;
  createdAt: string; updatedAt: string;
}
export type CreateCustomResponse = Omit<CustomResponse, "id" | "enabled" | "createdAt" | "updatedAt" | "kind"> & { kind: CustomResponseKind };
export interface LegacyResponseTransaction {
  modernNames(): Promise<string[]>;
  list(): Promise<CustomResponse[]>;
  create(input: CreateCustomResponse): Promise<CustomResponse>;
}
export interface LegacyResponseRepository {
  list(guildId: string): Promise<CustomResponse[]>;
  find(guildId: string, name: string): Promise<CustomResponse | null>;
  mutate<T>(guildId: string, operation: (tx: LegacyResponseTransaction) => Promise<T>): Promise<T>;
  remove(guildId: string, name: string): Promise<void>;
  update(guildId: string, name: string, values: { enabled?: boolean; response?: string }): Promise<void>;
}

export class LegacyNameConflict extends Error {}
