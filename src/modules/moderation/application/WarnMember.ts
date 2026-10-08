export interface WarningCase {
  id: number;
  guildId: string;
  caseNumber: number;
  targetUserId: string;
  moderatorUserId: string;
  action: "WARNING" | "TIMEOUT" | "KICK" | "BAN" | "UNBAN" | "NOTE";
  reason: string;
  durationMs: number | null;
  isGlobal: boolean;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface WarningRepository {
  countWarningsForUser(guildId: string, userId: string): Promise<number>;
  createCase(input: {
    guildId: string;
    targetUserId: string;
    moderatorUserId: string;
    action: "WARNING";
    reason: string;
    durationMs: number | null;
    isGlobal: boolean;
    metadata: { warningRoleId: string; warningCount: number; originGuildId?: string };
  }): Promise<WarningCase>;
}

export interface RecordWarningInput {
  guildId: string;
  targetUserId: string;
  moderatorUserId: string;
  reason: string;
  durationMs: number | null;
  warningCount: number;
  warningRoleId: string;
  originGuildId?: string;
}

/** Transport effects use IDs and plain data; Discord objects stay in the adapter. */
export interface WarningEffects {
  prepareRole(guildId: string, count: number): Promise<{ id: string; name: string; error: string | null }>;
  assignRole(guildId: string, roleId: string): Promise<void>;
}
export type WarnInput = Omit<RecordWarningInput, "warningCount" | "warningRoleId">;
export type WarningResult =
  | { status: "rejected"; roleName: string; reason: string }
  | { status: "created"; roleName: string; moderationCase: WarningCase };

export class WarnMember {
  constructor(private readonly repository: WarningRepository) {}

  async execute(input: WarnInput, effects: WarningEffects): Promise<WarningResult> {
    const warningCount = await this.nextWarningCount(input.guildId, input.targetUserId);
    const role = await effects.prepareRole(input.guildId, warningCount);
    if (role.error) return { status: "rejected", roleName: role.name, reason: role.error };
    // Preserve the audit case if Discord assignment subsequently fails.
    const moderationCase = await this.record({ ...input, warningCount, warningRoleId: role.id });
    await effects.assignRole(input.guildId, role.id);
    return { status: "created", roleName: role.name, moderationCase };
  }

  async nextWarningCount(guildId: string, targetUserId: string) {
    return (await this.repository.countWarningsForUser(guildId, targetUserId)) + 1;
  }

  record(input: RecordWarningInput) {
    const { warningCount, warningRoleId, originGuildId, ...caseInput } = input;
    return this.repository.createCase({
      ...caseInput,
      action: "WARNING",
      isGlobal: originGuildId !== undefined,
      metadata: {
        warningRoleId,
        warningCount,
        ...(originGuildId ? { originGuildId } : {}),
      },
    });
  }
}
