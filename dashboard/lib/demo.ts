import "server-only";
import { randomUUID } from "node:crypto";
import { ApiError } from "./bridge";
import { checkedWorkflow, workflowSchema, executeWorkflow } from "../../src/dashboard/workflows";
import { settingsPatchSchema, moderationSchema } from "../../src/dashboard/contracts";
import { CustomCommandValidator } from "../../src/modules/custom-commands/domain/CustomCommandValidator";
import { z } from "zod";
import type {
  Account,
  Case,
  Catalog,
  Event,
  Guild,
  Member,
  Overview,
  Plugins,
  Resources,
  SavedWorkflow,
  Settings,
  TicketDetail,
  Report,
  Workflow,
} from "./types";
export const DEMO_GUILD = "222222222222222222",
  DEMO_ACTOR = "111111111111111111";
export const initialWorkflow: Workflow = {
  version: 1 as const,
  name: "welcome",
  description: "Make every first hello feel personal.",
  nodes: [
    {
      id: "trigger",
      kind: "trigger",
      label: "Command invoked",
      position: { x: 60, y: 100 },
      config: { event: "command" },
    },
    {
      id: "cooldown",
      kind: "cooldown",
      label: "Keep it friendly",
      position: { x: 340, y: 100 },
      config: { seconds: 30 },
    },
    {
      id: "response",
      kind: "response",
      label: "Welcome message",
      position: { x: 620, y: 100 },
      config: { text: "Hey there! Welcome to our little corner of Discord. ✨" },
    },
  ],
  edges: [
    { id: "e1", source: "trigger", target: "cooldown", port: "next" as const },
    { id: "e2", source: "cooldown", target: "response", port: "next" as const },
  ],
};
interface DemoState {
  updated: number;
  account: Account;
  guilds: Guild[];
  members: Member[];
  cases: Case[];
  reports: Report[];
  tickets: TicketDetail[];
  catalog: Catalog;
  settings: Settings;
  plugins: Plugins;
  workflows: SavedWorkflow[];
  events: Event[];
  operations: Map<string, { input: string; result: unknown }>;
}
const sessions = new Map<string, DemoState>();
function seed(): DemoState {
  const now = new Date().toISOString(),
    memberId = (n: number) => String(333333333333333300n + BigInt(n));
  const names = [
    "Sofia Chen",
    "Kai Nakamura",
    "Jamie Parker",
    "Morgan Lee",
    "Taylor Brooks",
    "Riley Bennett",
    "Avery Wilson",
    "Casey Rivera",
    "Jordan Ellis",
    "Quinn Foster",
    "Charlie Kim",
    "Emerson Reed",
  ];
  const members = names.map((name, i) => ({
    id: memberId(i),
    name,
    username: name.toLowerCase().replaceAll(" ", "."),
    bot: false,
    joinedAt: new Date(Date.now() - (i + 2) * 86400000).toISOString(),
    roles: [
      {
        id: i % 3 === 0 ? "444444444444444444" : "444444444444444445",
        name: i % 3 === 0 ? "Community team" : "Member",
        color: i % 3 === 0 ? "#a78bfa" : "#60a5fa",
      },
    ],
  }));
  const cases = Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    guildId: DEMO_GUILD,
    caseNumber: 108 - i,
    targetUserId: memberId(i),
    moderatorUserId: DEMO_ACTOR,
    action: ["WARNING", "NOTE", "TIMEOUT", "BAN"][i % 4]!,
    reason: [
      "Repeated off-topic posts after a reminder",
      "Helpful context for the moderation team",
      "Cooldown after a heated discussion",
      "Spam account confirmed",
    ][i % 4]!,
    durationMs: i % 4 === 2 ? 3600000 : null,
    isGlobal: false,
    metadata: { demo: true },
    createdAt: new Date(Date.now() - (i + 1) * 7200000).toISOString(),
    updatedAt: now,
  }));
  const tickets = Array.from({ length: 6 }, (_, i) => ({
    id: String(555555555555555550n + BigInt(i)),
    name: [
      "help-with-verification",
      "partnership-inquiry",
      "role-request",
      "event-question",
      "account-support",
      "resolved-thank-you",
    ][i]!,
    ownerId: memberId(i),
    supportRoleId: "444444444444444444",
    state: i < 4 ? ("open" as const) : ("closed" as const),
    createdAt: new Date(Date.now() - (i + 1) * 3600000).toISOString(),
    truncated: false,
    source: "better-ticket",
    priority: "normal",
    claimedBy: null,
    tags: [],
    notes: [],
    transcript: null,
    messages: [
      {
        id: `m${i}`,
        author: names[i]!,
        authorId: memberId(i),
        content: [
          "Hi! I’m having trouble getting verified. Could someone help me out?",
          "Hey team, I’d love to discuss a community partnership.",
          "Could I get access to the design channels?",
          "What time does the community event start?",
        ][i % 4]!,
        createdAt: now,
        attachments: [],
        embeds: [],
      },
    ],
  }));
  const validator = new CustomCommandValidator();
  const custom = [
    {
      name: "rules",
      description: "A friendly reminder of our community guidelines",
      content: [{ type: "TEXT", text: "Be kind. Stay curious. Read #guidelines before posting." }],
      aliases: ["guidelines"],
    },
    {
      name: "socials",
      description: "Find the community around the web",
      content: [{ type: "TEXT", text: "Find us on Discord and GitHub!" }],
      aliases: ["links"],
    },
  ].map((c, i) => ({
    ...validator.definition(c),
    id: i + 1,
    guildId: DEMO_GUILD,
    createdBy: DEMO_ACTOR,
    updatedBy: DEMO_ACTOR,
    createdAt: now,
    updatedAt: now,
    usageCount: i ? 76 : 128,
    lastUsedAt: now,
  }));
  const events = Array.from({ length: 36 }, (_, i) => ({
    id: i + 1,
    guildId: DEMO_GUILD,
    actorId: i % 2 ? DEMO_ACTOR : memberId(i % 12),
    type: ["member.join", "command.executed", "ticket.changed", "moderation.changed"][i % 4]!,
    summary: [
      `${names[i % 12]} joined the community`,
      `/rules executed`,
      `Ticket activity updated`,
      `A moderation case was recorded`,
    ][i % 4]!,
    createdAt: new Date(Date.now() - (36 - i) * 3600000).toISOString(),
    data: null,
  }));
  return {
    updated: Date.now(),
    account: { id: DEMO_ACTOR, name: "Alex Morgan", theme: "dark" },
    guilds: [
      {
        id: DEMO_GUILD,
        name: "The Common Room",
        icon: null,
        memberCount: 1284,
        installed: true,
        verified: true,
        capabilities: ["overview", "moderation", "tickets", "settings", "commands", "plugins"],
      },
      {
        id: "222222222222222223",
        name: "Design Collective",
        icon: null,
        memberCount: 0,
        installed: false,
        verified: false,
        capabilities: [],
      },
    ],
    members,
    cases,
    reports: [
      {
        id: 1,
        reportNumber: 12,
        reportedUserId: memberId(4),
        reporterUserId: memberId(2),
        reason: "Repeated unsolicited direct messages",
        status: "PENDING",
        createdAt: now,
      },
    ],
    tickets,
    catalog: {
      builtins: [
        {
          name: "warn",
          canonical: "warn",
          description: "Warn a server member",
          permissions: "1099511627776",
          protected: false,
          options: [],
        },
        {
          name: "ban",
          canonical: "ban",
          description: "Ban a user",
          permissions: "4",
          protected: false,
          options: [],
        },
        {
          name: "ticket",
          canonical: "ticket",
          description: "Open and manage support tickets",
          permissions: null,
          protected: false,
          options: [],
        },
        {
          name: "verify",
          canonical: "verify",
          description: "Verify server ownership",
          permissions: null,
          protected: true,
          options: [],
        },
        {
          name: "settings",
          canonical: "settings",
          description: "Configure Centerify",
          permissions: "32",
          protected: true,
          options: [],
        },
        {
          name: "flow",
          canonical: "flow",
          description: "Run a published workflow",
          permissions: null,
          protected: false,
          options: [],
        },
        {
          name: "help",
          canonical: "help",
          description: "Discover Centerify commands",
          permissions: null,
          protected: false,
          options: [],
        },
      ],
      custom,
      legacy: [],
      prefix: "!",
      configuration: {},
    },
    settings: {
      config: {
        guildId: DEMO_GUILD,
        updatedAt: now,
        welcomeEnabled: true,
        welcomeChannelId: "666666666666666666",
        welcomeMessage: "Welcome {user} to **{server}**! Make yourself at home.",
        goodbyeEnabled: false,
        goodbyeChannelId: null,
        goodbyeMessage: "See you around, {displayName}.",
        autoRoleEnabled: false,
        autoRoleId: null,
        loggingEnabled: true,
        loggingChannelId: "666666666666666667",
        xpEnabled: true,
        xpMethods: "messages,reactions,daily",
        xpMessageAmount: 15,
        xpReactionAmount: 5,
        xpDailyAmount: 100,
        xpCooldownSeconds: 60,
        xpSharing: "server",
        xpSharedGuildIds: "",
        globalBanEnabled: false,
        globalWarnEnabled: false,
        globalNoteEnabled: false,
        ticketSettings: {
          enabled: true,
          categoryId: "666666666666666668",
          supportRoleId: "444444444444444444",
        },
      },
      warningRoleSettings: { mode: "none" },
      commandRoleAccess: {},
      restartSettings: {
        note: "Demo configuration. Production uses centerify.config.json sparse overrides.",
      },
    },
    plugins: {
      extensions: [],
      activations: [],
      installed: { plugins: {} },
      catalog: [
        {
          manifest: {
            id: "better-ticket",
            name: "Better Ticket",
            description: "Advanced ticket profiles, assignment, transcripts and recovery.",
            version: "1.0.0",
            permissions: ["ManageChannels", "ManageRoles"],
            dependencies: ["guilds"],
          },
        },
      ],
      operator: false,
      installation:
        "An authorized operator installs trusted code with centerify-plugins.cmd. A restart loads the approved package.",
    },
    workflows: [
      {
        id: 1,
        guildId: DEMO_GUILD,
        name: "welcome",
        revision: 1,
        draft: initialWorkflow,
        published: null,
        enabled: false,
        history: [],
        updatedAt: now,
      },
    ],
    events,
    operations: new Map(),
  };
}
export function demoState(session: string) {
  for (const [key, value] of sessions)
    if (Date.now() - value.updated > 8 * 3600000) sessions.delete(key);
  let state = sessions.get(session);
  if (!state) {
    if (sessions.size >= 100) throw new ApiError(429, "Demo capacity reached");
    state = seed();
    sessions.set(session, state);
  }
  state.updated = Date.now();
  return state;
}
export const demoResources: Resources = {
  channels: [
    { id: "666666666666666666", name: "welcome", type: 0 },
    { id: "666666666666666667", name: "mod-log", type: 0 },
    { id: "666666666666666669", name: "general", type: 0 },
    { id: "666666666666666668", name: "Support", type: 4 },
  ],
  roles: [
    { id: "444444444444444444", name: "Community team", managed: false, position: 3 },
    { id: "444444444444444445", name: "Member", managed: false, position: 1 },
  ],
  botId: "777777777777777777",
};
function emit(s: DemoState, type: string, summary: string, data: unknown = null) {
  s.events.push({
    id: (s.events.at(-1)?.id ?? 0) + 1,
    guildId: DEMO_GUILD,
    actorId: DEMO_ACTOR,
    type,
    summary: `Demo: ${summary}`,
    data,
    createdAt: new Date().toISOString(),
  });
}
export function demoRead(
  s: DemoState,
  guildId: string,
  resource: string,
  query: URLSearchParams,
): unknown {
  if (guildId !== DEMO_GUILD)
    throw new ApiError(403, "This demo workspace is isolated from other servers");
  if (resource === "overview") {
    const days = Math.min(90, Math.max(1, Number(query.get("days") ?? 7)));
    const overview: Overview = {
      guild: { ...s.guilds[0]!, ownerId: DEMO_ACTOR },
      capabilities: s.guilds[0]!.capabilities,
      verified: true,
      health: {
        connected: true,
        uptimeMs: 3 * 86400000 + 14760000,
        latencyMs: 42,
        modules: [
          "guilds",
          "moderation",
          "tickets",
          "custom-commands",
          "welcome",
          "xp",
          "settings",
          "management",
          "plugins",
          "information",
        ].map((id) => ({ id, name: id, version: "1.0.0", enabled: true })),
      },
      stats: {
        commands: 204,
        commandsPrevious: 176,
        joins: 48,
        joinsPrevious: 35,
        leaves: 12,
        moderation: s.cases.length,
        moderationPrevious: 12,
      },
      series: Array.from({ length: days }, (_, i) => ({
        day: new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10),
        commands: [18, 27, 21, 38, 29, 46, 25][i % 7]!,
        joins: [4, 7, 5, 9, 6, 11, 6][i % 7]!,
        leaves: [1, 2, 1, 3, 2, 1, 2][i % 7]!,
        moderation: [1, 0, 2, 1, 0, 3, 1][i % 7]!,
      })),
      events: s.events.slice(-8).reverse(),
      collection: {
        since: new Date(Date.now() - days * 86400000).toISOString(),
        capped: false,
        note: "Illustrative demo data. No Discord server is connected.",
      },
    };
    return overview;
  }
  if (resource === "resources") return demoResources;
  if (resource === "ticket-profiles") return [];
  if (resource === "members") {
    const q = (query.get("q") ?? "").toLowerCase();
    return {
      items: s.members.filter((m) => m.name.toLowerCase().includes(q) || m.username.includes(q)),
      after: null,
    };
  }
  if (resource.startsWith("members/")) {
    const id = resource.split("/")[1];
    return {
      member: s.members.find((m) => m.id === id) ?? { id, name: "Former member" },
      cases: s.cases.filter((c) => c.targetUserId === id),
      xp: 420,
    };
  }
  if (resource === "cases") return s.cases;
  if (resource === "reports") return s.reports;
  if (resource === "bans")
    return s.cases
      .filter((c) => c.action === "BAN")
      .map((c) => ({
        id: c.targetUserId,
        name: s.members.find((m) => m.id === c.targetUserId)?.name ?? c.targetUserId,
        reason: c.reason,
      }));
  if (resource === "tickets") return s.tickets.map(({ messages: _messages, ...t }) => t);
  if (resource.startsWith("tickets/")) {
    const ticket = s.tickets.find((t) => t.id === resource.split("/")[1]);
    if (!ticket) throw new ApiError(404, "Ticket not found");
    return ticket;
  }
  if (resource === "commands") return s.catalog;
  if (resource === "settings") return s.settings;
  if (resource === "plugins") return s.plugins;
  if (resource === "workflows") return s.workflows;
  if (resource === "audit") return s.events.slice().reverse();
  if (resource === "xp") return s.members.map((m, i) => ({ userId: m.id, xp: 1280 - i * 73 }));
  if (resource === "events") {
    const cursor = Number(query.get("cursor") ?? 0);
    return {
      reset: false,
      events: s.events.filter((e) => e.id > cursor).map((e) => ({ ...e, data: null })),
    };
  }
  throw new ApiError(404, "Resource not found");
}
export async function demoMutate(
  s: DemoState,
  guildId: string,
  resource: string,
  input: unknown,
  key: string,
): Promise<unknown> {
  if (guildId !== DEMO_GUILD) throw new ApiError(403, "Cross-server access denied");
  const old = s.operations.get(key),
    digest = JSON.stringify({ resource, input });
  if (old) {
    if (old.input !== digest) throw new ApiError(409, "Operation key already used");
    return old.result;
  }
  const body = z.record(z.string(), z.unknown()).parse(input);
  let result: unknown;
  if (resource === "settings") {
    if (body.expectedUpdatedAt !== s.settings.config.updatedAt)
      throw new ApiError(409, "Settings changed elsewhere. Reload before saving.");
    const patch = settingsPatchSchema.parse(body.patch);
    Object.assign(s.settings.config, patch, { updatedAt: new Date().toISOString() });
    result = s.settings.config;
    emit(s, "config.changed", "Settings saved in this demo session");
  } else if (resource === "moderation") {
    const parsed = moderationSchema.parse(input);
    const results = parsed.userIds.map((userId) => {
      s.cases.unshift({
        id: Date.now() + s.cases.length,
        guildId,
        caseNumber: Math.max(...s.cases.map((c) => c.caseNumber)) + 1,
        targetUserId: userId,
        moderatorUserId: DEMO_ACTOR,
        action: parsed.action.toUpperCase(),
        reason: parsed.reason,
        durationMs: parsed.durationMs ?? null,
        isGlobal: false,
        metadata: { demo: true },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return {
        userId,
        status: "simulated",
        message: `Simulated ${parsed.action}. No Discord action occurred.`,
      };
    });
    result = { results };
    emit(s, "moderation.changed", "Moderation action simulated");
  } else if (resource.startsWith("tickets/")) {
    const ticket = s.tickets.find((t) => t.id === resource.split("/")[1]);
    if (!ticket) throw new ApiError(404, "Ticket not found");
    const action = z
      .enum([
        "close",
        "reopen",
        "claim",
        "unclaim",
        "priority",
        "tags",
        "note",
        "transcript",
        "add",
        "remove",
      ])
      .parse(body.action);
    if (action === "close" || action === "reopen")
      ticket.state = action === "close" ? "closed" : "open";
    if (action === "claim")
      ticket.claimedBy = z
        .string()
        .regex(/^\d{17,20}$/)
        .parse(body.member ?? DEMO_ACTOR);
    if (action === "unclaim") ticket.claimedBy = null;
    if (action === "priority")
      ticket.priority = z.enum(["low", "normal", "high", "urgent"]).parse(body.priority);
    if (action === "tags")
      ticket.tags = z.array(z.string().trim().min(1).max(32)).max(10).parse(body.tags);
    if (action === "note") {
      ticket.notes ??= [];
      ticket.notes.push({
        by: DEMO_ACTOR,
        text: z.string().trim().min(1).max(1000).parse(body.text),
        at: Date.now(),
      });
    }
    result = { message: `Demo: ${action} simulated. No Discord action occurred.` };
    emit(s, "ticket.changed", `Ticket ${action} simulated`);
  } else if (resource === "reports") {
    const report = s.reports.find((r) => r.reportNumber === body.number);
    if (!report) throw new ApiError(404, "Report not found");
    report.status = z.enum(["ACCEPTED", "REJECTED"]).parse(body.status);
    result = report;
    emit(s, "moderation.changed", "Report review simulated");
  } else if (resource === "plugins") {
    const ext = s.plugins.extensions.find((e) => e.id === body.id);
    if (!ext) throw new ApiError(400, "Unknown plugin");
    const activation = s.plugins.activations.find((a) => a.pluginId === body.id),
      revision = activation?.revision ?? 0;
    if (body.revision !== revision) throw new ApiError(409, "Plugin settings changed");
    const config = z.record(z.string(), z.unknown()).parse(body.config);
    const next = {
      pluginId: ext.id,
      enabled: z.boolean().parse(body.enabled),
      config,
      revision: revision + 1,
    };
    s.plugins.activations = s.plugins.activations.filter((a) => a.pluginId !== ext.id).concat(next);
    result = next;
    emit(s, "plugin.changed", "Plugin activation updated");
  } else if (resource === "commands") {
    const name = String(body.name ?? ""),
      existing = s.catalog.custom.find((c) => c.name === name),
      validator = new CustomCommandValidator();
    if (body.action === "diagnose") {
      result = {
        allowed: existing?.enabled ?? false,
        explanation: existing?.enabled
          ? "Demo checks passed for this command, channel and user."
          : "Command is disabled or unavailable.",
      };
    } else if (body.action === "delete") {
      s.catalog.custom = s.catalog.custom.filter((c) => c.name !== name);
      result = { deleted: true };
    } else if (body.action === "create" || body.action === "update") {
      if (existing && body.expectedUpdatedAt !== existing.updatedAt)
        throw new ApiError(409, "Command changed elsewhere");
      const definition = validator.definition(body.definition);
      if (
        s.catalog.builtins.some((c) => c.name === definition.name) ||
        s.catalog.custom.some((c) => c.name === definition.name && c !== existing)
      )
        throw new ApiError(409, "Command name is already in use");
      const command = {
        ...definition,
        id: existing?.id ?? Date.now(),
        guildId,
        createdBy: DEMO_ACTOR,
        updatedBy: DEMO_ACTOR,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usageCount: existing?.usageCount ?? 0,
        lastUsedAt: existing?.lastUsedAt ?? null,
      };
      s.catalog.custom = s.catalog.custom.filter((c) => c !== existing).concat(command);
      result = command;
      emit(s, "command.changed", "Command saved in demo");
    } else if (body.action === "import") {
      const data = z
        .object({ version: z.literal(1), commands: z.array(z.unknown()).max(100) })
        .parse(JSON.parse(String(body.file)));
      const definitions = data.commands.map((d) => validator.definition(d));
      for (const definition of definitions) {
        if (s.catalog.custom.some((c) => c.name === definition.name))
          throw new ApiError(409, "A command already uses this name");
      }
      for (const definition of definitions)
        s.catalog.custom.push({
          ...definition,
          id: Date.now() + s.catalog.custom.length,
          guildId,
          createdBy: DEMO_ACTOR,
          updatedBy: DEMO_ACTOR,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          usageCount: 0,
          lastUsedAt: null,
        });
      result = { count: definitions.length };
      emit(s, "command.changed", "Commands imported into demo");
    } else throw new ApiError(400, "Unsupported command operation");
  } else if (resource === "workflows") {
    const name = String(body.name),
      current = s.workflows.find((w) => w.name === name);
    if (body.action === "cancel") {
      result = { cancelled: true };
    } else if (body.action === "disable") {
      if (!current) throw new ApiError(404, "Workflow not found");
      current.enabled = false;
      current.revision++;
      result = current;
    } else {
      const definition =
        body.action === "rollback"
          ? current?.history.find((h) => h.revision === body.version)?.definition
          : body.definition;
      const checked =
        body.action === "save" ? workflowSchema.parse(definition) : checkedWorkflow(definition);
      if (body.action === "test")
        result = {
          runId: body.runId ?? randomUUID(),
          ...(await executeWorkflow(
            checked,
            {
              authorize: async () => {},
              permission: async () => true,
              cooldown: async () => true,
              action: async () => {
                throw new Error("Test mode cannot execute live actions");
              },
            },
            { test: true, args: z.array(z.string()).parse(body.args ?? []), actorId: DEMO_ACTOR },
          )),
        };
      else {
        if ((current?.revision ?? 0) !== body.revision)
          throw new ApiError(409, "Workflow changed elsewhere");
        const publish = body.action === "publish" || body.action === "rollback";
        const next: SavedWorkflow = {
          id: current?.id ?? Date.now(),
          guildId,
          name,
          revision: (current?.revision ?? 0) + 1,
          draft: checked,
          published: publish ? checked : (current?.published ?? null),
          history: current?.history ?? [],
          enabled: publish || current?.enabled || false,
          updatedAt: new Date().toISOString(),
        };
        if (publish && current)
          next.history = [
            ...next.history,
            {
              revision: current.revision,
              definition: current.published ?? current.draft,
              at: current.updatedAt,
              actorId: DEMO_ACTOR,
            },
          ];
        s.workflows = s.workflows.filter((w) => w.name !== name).concat(next);
        result = next;
        emit(s, "workflow.changed", `Workflow ${body.action} simulated`);
      }
    }
  } else throw new ApiError(400, "This operation requires a connected bot");
  s.operations.set(key, { input: digest, result });
  return result;
}
