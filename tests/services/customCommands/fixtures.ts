import { vi } from "vitest";
import { PermissionsBitField, PermissionFlagsBits } from "discord.js";
import type {
  CustomCommandDefinition,
  CustomCommandExecutionContext,
  CustomCommandRecord,
  CustomCommandRepository,
  CustomCommandTransaction,
} from "../../../src/lib/customCommands/types.js";
import { CustomCommandValidator } from "../../../src/services/customCommands/CustomCommandValidator.js";

export const ROLE = "123456789012345678",
  CHANNEL = "223456789012345678",
  USER = "323456789012345678";
export function definition(
  patch: Partial<CustomCommandDefinition> = {},
): CustomCommandDefinition {
  return new CustomCommandValidator().definition({
    name: "welcome",
    content: [
      { type: "TEXT", text: "Welcome {user.mention} to {guild.name}!" },
    ],
    ...patch,
  });
}
export function record(
  patch: Partial<CustomCommandRecord> = {},
): CustomCommandRecord {
  return {
    ...definition(),
    id: 1,
    guildId: "guild-a",
    createdBy: USER,
    updatedBy: USER,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    usageCount: 0,
    lastUsedAt: null,
    ...patch,
  };
}
export function context(
  patch: Partial<CustomCommandExecutionContext> = {},
): CustomCommandExecutionContext {
  const guild = {
    id: "guild-a",
    name: "Centerify Community",
    memberCount: 42,
    members: { me: { id: "bot" } },
  };
  const permissions = new PermissionsBitField([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ManageMessages,
  ]);
  const member = {
    id: USER,
    guild,
    user: { username: "Alex" },
    displayName: "Alex",
    roles: { cache: new Map([[ROLE, {}]]) },
    permissions,
  };
  const channel = {
    id: CHANNEL,
    guildId: guild.id,
    name: "general",
    isThread: () => false,
    permissionsFor: () => permissions,
  };
  return {
    guildId: guild.id,
    channelId: CHANNEL,
    userId: USER,
    guild,
    member,
    channel,
    command: record(),
    args: [],
    source: "message",
    ...patch,
  } as CustomCommandExecutionContext;
}
/** Transactional in-memory port: serialize mutations and roll back failed imports. */
export class MemoryRepository implements CustomCommandRepository {
  public records: CustomCommandRecord[] = [];
  public legacy: Record<string, string[]> = {};
  private sequence = 0;
  private revision = 0;
  private tail = Promise.resolve();
  public list = vi.fn(async (guildId: string) =>
    structuredClone(
      this.records.filter((record) => record.guildId === guildId),
    ),
  );
  public recordUsage = vi.fn(async (guildId: string, id: number) => {
    const found = this.records.find(
      (row) => row.guildId === guildId && row.id === id,
    );
    if (found) {
      found.usageCount++;
      found.lastUsedAt = new Date().toISOString();
    }
  });
  public async mutate<T>(
    guildId: string,
    operation: (tx: CustomCommandTransaction) => Promise<T>,
  ): Promise<T> {
    const previous = this.tail;
    let unlock!: () => void;
    this.tail = new Promise((resolve) => {
      unlock = resolve;
    });
    await previous;
    const original = structuredClone(this.records);
    try {
      return await operation({
        list: async () =>
          structuredClone(
            this.records.filter((row) => row.guildId === guildId),
          ),
        legacyNames: async () => this.legacy[guildId] ?? [],
        save: async (definition, actorId, id) => {
          const old = this.records.find(
            (row) => row.guildId === guildId && row.id === id,
          );
          const now = new Date(
            Date.UTC(2026, 9, 1, 0, 0, 0, ++this.revision),
          ).toISOString();
          const row = {
            ...record({
              id: id ?? ++this.sequence,
              guildId,
              createdBy: actorId,
            }),
            ...old,
            ...structuredClone(definition),
            updatedBy: actorId,
            updatedAt: now,
          };
          this.records = this.records.filter(
            (item) => !(item.guildId === guildId && item.id === row.id),
          );
          this.records.push(row);
          return structuredClone(row);
        },
        remove: async (id) => {
          this.records = this.records.filter(
            (row) => !(row.guildId === guildId && row.id === id),
          );
        },
      });
    } catch (error) {
      this.records = original;
      throw error;
    } finally {
      unlock();
    }
  }
}
