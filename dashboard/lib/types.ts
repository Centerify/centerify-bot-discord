export type Capability =
  "overview" | "moderation" | "tickets" | "settings" | "commands" | "plugins" | "operator";
export interface Guild {
  id: string;
  name: string;
  icon: string | null;
  installed: boolean;
  verified: boolean;
  capabilities: Capability[];
  memberCount: number;
}
export interface Account {
  id: string;
  name: string;
  theme: "dark" | "night" | "light" | "system";
}
export interface Me {
  user: { id: string; name: string; demo: boolean };
  guilds: Guild[];
  account: Account;
  installUrl: string | null;
}
export interface Event {
  id: number;
  guildId: string;
  actorId: string | null;
  type: string;
  summary: string;
  createdAt: string;
  data: unknown;
}
export interface Overview {
  guild: { id: string; name: string; memberCount: number; ownerId: string };
  capabilities: Capability[];
  verified: boolean;
  health: {
    connected: boolean;
    uptimeMs: number;
    latencyMs: number;
    modules: { id: string; name: string; version: string; enabled: boolean }[];
  };
  stats: {
    commands: number;
    commandsPrevious: number;
    joins: number;
    joinsPrevious: number;
    leaves: number;
    moderation: number;
    moderationPrevious: number;
  };
  series: { day: string; commands: number; joins: number; leaves: number; moderation: number }[];
  events: Event[];
  collection: { since: string; capped: boolean; note: string };
}
export interface Member {
  id: string;
  name: string;
  username: string;
  avatar?: string;
  bot: boolean;
  joinedAt?: string;
  roles: { id: string; name: string; color?: string }[];
  timeoutUntil?: string;
}
export interface Case {
  id: number;
  guildId: string;
  caseNumber: number;
  targetUserId: string;
  moderatorUserId: string;
  action: string;
  reason: string;
  durationMs: number | null;
  isGlobal: boolean;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}
export interface Report {
  id: number;
  reportNumber: number;
  reportedUserId: string;
  reporterUserId: string;
  reason: string;
  status: string;
  createdAt: string;
}
export interface Ticket {
  source?: string;
  number?: number;
  department?: string;
  priority?: string;
  claimedBy?: string | null;
  tags?: string[];
  status?: string;
  id: string;
  name: string;
  ownerId: string;
  supportRoleId: string;
  state: "open" | "closed";
  createdAt: string;
}
export interface TicketDetail extends Ticket {
  notes?: { by: string; text: string; at: number }[];
  transcript?: { url: string; truncated: boolean } | null;
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
}
export interface Resources {
  channels: { id: string; name: string; type: number }[];
  roles: { id: string; name: string; managed: boolean; position: number }[];
  botId: string;
}
export interface CustomCommand {
  id: number;
  guildId: string;
  name: string;
  description: string;
  enabled: boolean;
  aliases: string[];
  cooldownSeconds: number;
  usageCount: number;
  lastUsedAt: string | null;
  updatedAt: string;
  content: unknown[];
  [key: string]: unknown;
}
export interface Catalog {
  builtins: {
    name: string;
    canonical: string;
    description: string;
    permissions: string | null;
    protected: boolean;
    options: unknown;
  }[];
  custom: CustomCommand[];
  legacy: { name: string; kind: string; response: string; enabled: boolean }[];
  prefix: string;
  configuration: Record<string, unknown>;
}
export interface Settings {
  config: { guildId: string; updatedAt: string; [key: string]: unknown };
  warningRoleSettings: unknown;
  commandRoleAccess: unknown;
  restartSettings: unknown;
}
export interface ExtensionManifest {
  apiVersion: 1;
  id: string;
  name: string;
  description: string;
  version: string;
  dashboardApi: 1;
  dependencies: string[];
  capabilities: string[];
  navigation: { id: string; label: string }[];
  widgets: { id: string; title: string; description: string }[];
  themes: { id: string; accent: string }[];
  nodes: { id: string; label: string }[];
}
export interface Plugins {
  extensions: ExtensionManifest[];
  activations: {
    pluginId: string;
    enabled: boolean;
    revision: number;
    config: Record<string, unknown>;
  }[];
  installed: {
    plugins: Record<
      string,
      {
        manifest: { id: string; name: string; version: string; permissions: string[] };
        enabled: boolean;
        installedAt: string;
      }
    >;
  };
  catalog: {
    manifest: {
      id: string;
      name: string;
      description: string;
      version: string;
      permissions: string[];
      dependencies: string[];
    };
  }[];
  operator: boolean;
  installation: string;
}
export interface WorkflowNode {
  id: string;
  kind: string;
  label: string;
  position: { x: number; y: number };
  config: Record<string, string | number | boolean | (string | number | boolean)[]>;
}
export interface Workflow {
  version: 1;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: { id: string; source: string; target: string; port: "next" | "yes" | "no" | "error" }[];
}
export interface SavedWorkflow {
  id: number;
  guildId: string;
  name: string;
  revision: number;
  draft: Workflow;
  published: Workflow | null;
  history: { revision: number; definition: Workflow; at: string; actorId: string }[];
  enabled: boolean;
  updatedAt: string;
}
export interface Trace {
  runId: string;
  status: string;
  trace: { nodeId: string; label: string; status: string; result: string; elapsedMs: number }[];
}
