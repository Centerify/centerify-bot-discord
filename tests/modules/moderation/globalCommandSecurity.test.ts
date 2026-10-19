import { beforeEach, expect, test, vi } from "vitest";
import { PermissionFlagsBits as P, PermissionsBitField } from "discord.js";
const mocks = vi.hoisted(() => ({
  targets: vi.fn(),
  create: vi.fn(),
  config: vi.fn(),
  verified: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("../../../src/modules/guilds/discord/ownership.js", () => ({
  guildOwnershipService: { isVerified: mocks.verified },
}));
vi.mock("../../../src/modules/guilds/discord/config.js", () => ({
  guildConfigService: { getOrCreate: mocks.config },
}));
vi.mock("../../../src/modules/moderation/discord/services.js", () => ({
  moderationCaseService: { createCase: mocks.create },
}));
vi.mock("../../../src/adapters/logging/runtime.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../src/modules/moderation/discord/commandUtils.js", () => ({
  dmUser: vi.fn(),
  toAuditLogReason: (reason: string) => reason,
}));
vi.mock("../../../src/modules/moderation/discord/globalModeration.js", async (original) => {
  const actual =
    await original<typeof import("../../../src/modules/moderation/discord/globalModeration.js")>();
  return {
    ...actual,
    getGlobalModerationTargets: mocks.targets,
    globalModeration: {
      apply: async (input: { guildIds: string[] }, perform: (id: string) => Promise<unknown>) => {
        const cases: unknown[] = [],
          skippedGuildIds: string[] = [];
        for (const id of input.guildIds) {
          const result = await perform(id);
          if (result) cases.push(result);
          else skippedGuildIds.push(id);
        }
        return { cases, skippedGuildIds };
      },
    },
  };
});
import { BanCommand } from "../../../src/modules/moderation/discord/commands/ban.js";
import { NoteCommand } from "../../../src/modules/moderation/discord/commands/note.js";
import { runWarn } from "../../../src/modules/moderation/discord/warn.js";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verified.mockResolvedValue(true);
  mocks.config.mockResolvedValue({
    globalBanEnabled: true,
    globalWarnEnabled: true,
    globalNoteEnabled: true,
    warningRoleSettings: { mode: "none" },
  });
  mocks.create.mockImplementation(async (input) => ({ ...input, caseNumber: 1 }));
  mocks.warn.mockResolvedValue({
    status: "created",
    moderationCase: { guildId: "destination", caseNumber: 1 },
  });
});
function fixture(permissions: bigint[] = []) {
  const bot = {
    id: "bot",
    permissions: new PermissionsBitField([P.Administrator]),
    roles: { highest: {} },
  };
  const target = {
    id: "target",
    user: { bot: false, system: false },
    manageable: true,
    bannable: true,
    roles: { highest: { comparePositionTo: () => -1 }, add: vi.fn() },
  };
  const guild = {
    id: "destination",
    ownerId: "owner",
    name: "Destination",
    fetch: vi.fn(),
    members: { me: bot, fetch: vi.fn(), ban: vi.fn() },
  };
  const moderator = {
    id: "actor",
    guild,
    permissions: new PermissionsBitField(permissions),
    roles: { highest: {}, cache: new Map() },
  };
  guild.fetch.mockResolvedValue(guild);
  guild.members.fetch.mockImplementation(async ({ user }: { user: string }) =>
    user === "actor" ? moderator : target,
  );
  const interaction = {
    inCachedGuild: () => true,
    guildId: "source",
    guild: { ...guild, id: "source" },
    client: {},
    member: { ...moderator, permissions: new PermissionsBitField([P.Administrator]) },
    user: { id: "actor", tag: "Actor" },
    options: {
      getUser: () => ({ id: "target", tag: "Target" }),
      getBoolean: () => true,
      getString: (key: string) => (key === "duration" ? null : "Reason"),
      getInteger: () => 0,
      getSubcommand: () => "add",
    },
    deferReply: vi.fn(),
    editReply: vi.fn(),
    reply: vi.fn(),
  };
  mocks.targets.mockResolvedValue({ enabled: true, guilds: [guild] });
  return { guild, target, moderator, interaction };
}
async function run(action: "ban" | "warn" | "note", interaction: unknown) {
  if (action === "warn") return runWarn(interaction as never, { execute: mocks.warn } as never);
  const command = Object.create(action === "ban" ? BanCommand.prototype : NoteCommand.prototype);
  await command.chatInputRun(interaction);
}
test.each(["ban", "warn", "note"] as const)(
  "global %s cannot use source-server administrator privileges in a destination",
  async (action) => {
    const f = fixture();
    await run(action, f.interaction);
    expect(f.guild.members.ban).not.toHaveBeenCalled();
    expect(mocks.warn).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(f.interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("0/1") }),
    );
  },
);
test.each(["ban", "warn", "note"] as const)(
  "global %s still executes with destination permission and hierarchy",
  async (action) => {
    const f = fixture([P.BanMembers, P.ModerateMembers]);
    await run(action, f.interaction);
    expect(f.interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("1/1") }),
    );
  },
);
test.each(["ban", "warn"] as const)(
  "global %s never affects a higher-ranked destination member",
  async (action) => {
    const f = fixture([P.BanMembers, P.ModerateMembers]);
    let comparisons = 0;
    // First validation is in the source; the destination hierarchy is different.
    f.target.roles.highest.comparePositionTo = () => (++comparisons <= 2 ? -1 : 1);
    await run(action, f.interaction);
    expect(f.guild.members.ban).not.toHaveBeenCalled();
    expect(mocks.warn).not.toHaveBeenCalled();
  },
);

test("a failed ban target lookup cannot bypass member hierarchy checks", async () => {
  const f = fixture([P.BanMembers]);
  f.guild.members.fetch.mockRejectedValue(new Error("Discord unavailable"));
  await run("ban", f.interaction);
  expect(f.guild.members.ban).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(f.interaction.editReply).toHaveBeenCalledWith({
    content: "I could not ban that user right now.",
  });
});
