import { type SapphireClient } from "@sapphire/framework";
import {
  ChannelType,
  PermissionFlagsBits as P,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type Guild,
  type GuildMember,
  type GuildTextBasedChannel,
} from "discord.js";
import { z } from "zod";
import { withApplication } from "../adapters/discord/context.js";
import { type ModuleRegistry } from "../core/index.js";
import {
  guildConfigToken,
  guildOwnershipToken,
  commandRoleDenial,
  commandRoleAccess,
  warningRoleSettings,
  type GuildConfigUpdate,
} from "../modules/guilds/index.js";
import {
  customCommandsToken,
  legacyResponsesToken,
  customCommandOptionsToken,
  type CustomCommandRecord,
  type EffectAction,
} from "../modules/custom-commands/index.js";
import { CustomCommandPermissionService } from "../modules/custom-commands/discord/CustomCommandPermissionService.js";
import { ComponentActionExecutor } from "../modules/custom-commands/discord/ComponentActionExecutor.js";
import { pluginManagerToken } from "../modules/plugins/index.js";
import {
  validateAssignableRole,
  isUsableTextChannel,
  canSendToChannel,
} from "../modules/guilds/discord/permissions.js";
import { moderationCasesToken, reportsToken, warnMemberKey } from "../modules/moderation/index.js";
import { validateMemberAction } from "../modules/moderation/discord/permissionGuards.js";
import {
  getOrCreateWarnRole,
  applyWarningRoleStyle,
} from "../modules/moderation/discord/warningRoleSettings.js";
import { scheduleWarningRoleRemoval } from "../modules/moderation/discord/warningRoles.js";
import type { EnvironmentConfiguration } from "../bootstrap/config.js";
import {
  DashboardError,
  moderationSchema,
  settingsPatchSchema,
  snowflake,
  themeSchema,
  type Capability,
  type DashboardGuild,
} from "./contracts.js";
import { requireCapability } from "./security.js";
import { DashboardStore } from "./store.js";
import {
  checkedWorkflow,
  workflowSchema,
  executeWorkflow,
  interpolate,
  type Workflow,
  type WorkflowNode,
} from "./workflows.js";
import {
  dashboardExtensionToken,
  validateExtensions,
  type DashboardExtension,
} from "./extensions.js";
import { authorizedTicket, changeTicketState } from "./tickets.js";
import { parseTicketTopic } from "../modules/tickets/domain/records.js";
import { commandCatalog } from "./catalog.js";
import { ticketDashboardToken, type TicketSummary } from "./ticketPort.js";

export class DashboardService {
  private readonly seenConfiguration = new Map<string, string>();
  private readonly cooldowns = new Map<string, number>();
  private readonly runs = new Map<
    string,
    { actorId: string; guildId: string; controller: AbortController }
  >();
  constructor(
    readonly client: SapphireClient,
    readonly application: ModuleRegistry,
    readonly config: EnvironmentConfiguration,
    readonly store = new DashboardStore(),
  ) {}
  async access(actorId: string, guildId: string, requireDashboard = true) {
    snowflake.parse(actorId);
    snowflake.parse(guildId);
    if (!this.client.isReady())
      throw new DashboardError(503, "Centerify is disconnected from Discord");
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) throw new DashboardError(404, "Centerify is not installed in this server");
    const actor = await guild.members.fetch({ user: actorId, force: true }).catch(() => null);
    if (!actor) throw new DashboardError(403, "You are no longer a member of this server");
    const config = await this.application.resolve(guildConfigToken).getOrCreate(guildId);
    const previousConfiguration = this.seenConfiguration.get(guildId);
    this.seenConfiguration.set(guildId, config.updatedAt);
    if (previousConfiguration && previousConfiguration !== config.updatedAt)
      void this.store
        .emit(guildId, "config.changed", "Persisted server settings changed")
        .catch(() => {});
    const capabilities: Capability[] = [];
    const manager = actor.id === guild.ownerId || actor.permissions.has(P.ManageGuild);
    if (manager) capabilities.push("overview", "settings", "commands", "plugins");
    if (manager || actor.permissions.any([P.ModerateMembers, P.BanMembers, P.KickMembers]))
      capabilities.push("moderation");
    const supportRole =
      config.ticketSettings &&
      typeof config.ticketSettings === "object" &&
      "supportRoleId" in config.ticketSettings
        ? config.ticketSettings.supportRoleId
        : null;
    if (
      manager ||
      actor.permissions.has(P.ManageChannels) ||
      (typeof supportRole === "string" && actor.roles.cache.has(supportRole))
    )
      capabilities.push("tickets");
    if (!capabilities.includes("tickets")) {
      for (const { value: port } of this.application.extensions(ticketDashboardToken))
        if (await port.supports(guild, actor)) {
          capabilities.push("tickets");
          break;
        }
    }
    if (capabilities.length && !capabilities.includes("overview")) capabilities.push("overview");
    if (this.operators().has(actorId)) capabilities.push("operator");
    if (requireDashboard && !capabilities.includes("overview"))
      throw new DashboardError(
        403,
        "Manage Server, moderation permission or a ticket support role is required",
      );
    const verified = await this.application
      .resolve(guildOwnershipToken)
      .isVerified(guild.id, guild.ownerId);
    return { guild, actor, config, capabilities, verified };
  }
  operators() {
    return new Set((process.env.CENTERIFY_DASHBOARD_OPERATORS ?? "").split(",").filter(Boolean));
  }
  async guilds(actorId: string): Promise<DashboardGuild[]> {
    const result: DashboardGuild[] = [];
    for (const guild of this.client.guilds.cache.values()) {
      try {
        const access = await this.access(actorId, guild.id);
        result.push({
          id: guild.id,
          name: guild.name,
          icon: guild.iconURL(),
          memberCount: guild.memberCount,
          installed: true,
          verified: access.verified,
          capabilities: access.capabilities,
        });
      } catch (error) {
        if (!(error instanceof DashboardError) || error.status !== 403) throw error;
      }
    }
    return result;
  }
  extensions(): DashboardExtension[] {
    const extensions = this.application.extensions(dashboardExtensionToken).map((e) => e.value);
    validateExtensions(
      extensions,
      new Set(
        this.application
          .list()
          .filter((m) => m.enabled)
          .map((m) => m.id),
      ),
    );
    return extensions;
  }
  pluginActions() {
    return this.extensions().flatMap((e) =>
      e.manifest.nodes.map((n) => `${e.manifest.id}:${n.id}`),
    );
  }
  async read(actorId: string, guildId: string, resource: string, query: URLSearchParams) {
    const access = await this.access(actorId, guildId),
      { guild, actor, capabilities, config } = access;
    if (resource === "events") {
      requireCapability(capabilities, "overview");
      const cursor = z.coerce
        .number()
        .int()
        .min(0)
        .max(Number.MAX_SAFE_INTEGER)
        .parse(query.get("cursor") ?? 0);
      return this.store.events(guildId, cursor);
    }
    if (resource === "overview") {
      const days = z.coerce
        .number()
        .int()
        .min(1)
        .max(90)
        .parse(query.get("days") ?? 7);
      const since = new Date(Date.now() - days * 86400000).toISOString(),
        previous = new Date(Date.now() - days * 2 * 86400000).toISOString();
      const events = await this.store.database.orm.public.DashboardEvent.where({ guildId })
        .where((e) => e.createdAt.gte(previous))
        .orderBy((e) => e.id.desc())
        .limit(10000)
        .all();
      const current = events.filter((e) => e.createdAt >= since),
        prior = events.filter((e) => e.createdAt < since);
      const count = (rows: typeof events, type: string) =>
        rows.filter((e) => e.type.startsWith(type)).length;
      const series = Array.from({ length: days }, (_, i) => {
        const day = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
        const rows = current.filter((e) => e.createdAt.startsWith(day));
        return {
          day,
          commands: count(rows, "command."),
          joins: count(rows, "member.join"),
          leaves: count(rows, "member.leave"),
          moderation: count(rows, "moderation."),
        };
      });
      return {
        guild: {
          id: guild.id,
          name: guild.name,
          memberCount: guild.memberCount,
          ownerId: guild.ownerId,
        },
        capabilities,
        verified: access.verified,
        health: {
          connected: this.client.isReady(),
          uptimeMs: this.client.uptime,
          latencyMs: Math.max(0, this.client.ws.ping),
          modules: this.application
            .list()
            .map((m) => ({ id: m.id, name: m.name, version: m.version, enabled: m.enabled })),
        },
        stats: {
          commands: count(current, "command."),
          commandsPrevious: count(prior, "command."),
          joins: count(current, "member.join"),
          joinsPrevious: count(prior, "member.join"),
          leaves: count(current, "member.leave"),
          moderation: count(current, "moderation."),
          moderationPrevious: count(prior, "moderation."),
        },
        series,
        events: current.slice(0, 10).map((e) => ({ ...e, data: null })),
        collection: {
          since,
          capped: events.length === 10000,
          note: "Activity is collected while the dashboard bridge is enabled. No historical activity is fabricated.",
        },
      };
    }
    if (resource === "members") {
      requireCapability(capabilities, "moderation");
      const q = (query.get("q") ?? "").trim().slice(0, 100),
        after = query.get("after");
      const members = q
        ? await guild.members.search({ query: q, limit: 50 })
        : await guild.members.list({
            limit: 50,
            ...(after ? { after: snowflake.parse(after) } : {}),
          });
      return {
        items: [...members.values()].map((m) => ({
          id: m.id,
          name: m.displayName,
          username: m.user.username,
          avatar: m.displayAvatarURL(),
          bot: m.user.bot,
          joinedAt: m.joinedAt?.toISOString(),
          roles: m.roles.cache
            .filter((r) => r.id !== guild.id)
            .map((r) => ({ id: r.id, name: r.name, color: r.hexColor })),
          timeoutUntil: m.communicationDisabledUntil?.toISOString(),
        })),
        after: members.size === 50 ? members.last()?.id : null,
      };
    }
    if (resource.startsWith("members/")) {
      requireCapability(capabilities, "moderation");
      const userId = snowflake.parse(resource.split("/")[1]);
      const member = await guild.members.fetch({ user: userId, force: true }).catch(() => null);
      const [cases, xp] = await Promise.all([
        this.application.resolve(moderationCasesToken).recentForUser(guildId, userId, 100),
        this.store.database.orm.public.MemberXp.where({ guildId, userId }).first(),
      ]);
      return {
        member: member
          ? {
              id: member.id,
              name: member.displayName,
              username: member.user.username,
              roles: member.roles.cache.map((r) => ({ id: r.id, name: r.name })),
              joinedAt: member.joinedAt?.toISOString(),
            }
          : { id: userId, name: "Former member" },
        cases,
        xp: xp?.xp ?? 0,
      };
    }
    if (resource === "cases") {
      requireCapability(capabilities, "moderation");
      return this.store.database.orm.public.ModerationCase.where({ guildId })
        .orderBy((c) => c.caseNumber.desc())
        .limit(100)
        .all();
    }
    if (resource === "reports") {
      requireCapability(capabilities, "moderation");
      return this.store.database.orm.public.MemberReport.where({ guildId })
        .orderBy((c) => c.reportNumber.desc())
        .limit(100)
        .all();
    }
    if (resource === "bans") {
      requireCapability(capabilities, "moderation");
      if (!actor.permissions.has(P.BanMembers))
        throw new DashboardError(403, "Ban Members permission is required");
      return [...(await guild.bans.fetch({ limit: 100 })).values()].map((b) => ({
        id: b.user.id,
        name: b.user.username,
        reason: b.reason,
      }));
    }
    if (resource === "tickets") {
      requireCapability(capabilities, "tickets");
      const channels = await guild.channels.fetch();
      const items: TicketSummary[] = [...channels.values()].flatMap((c) => {
        if (!c || c.type !== ChannelType.GuildText) return [];
        const record = parseTicketTopic(c.topic);
        if (
          !record ||
          record.botId !== guild.members.me?.id ||
          !c.permissionsFor(actor)?.has([P.ViewChannel, P.ReadMessageHistory])
        )
          return [];
        return [{ id: c.id, name: c.name, createdAt: c.createdAt.toISOString(), ...record }];
      });
      for (const { value: port } of this.application.extensions(ticketDashboardToken))
        items.push(...(await port.list(guild, actor)));
      return items;
    }
    if (resource.startsWith("tickets/")) {
      requireCapability(capabilities, "tickets");
      const channelId = snowflake.parse(resource.split("/")[1]);
      for (const { value: port } of this.application.extensions(ticketDashboardToken)) {
        const detail = await port.read(guild, actor, channelId);
        if (detail) return detail;
      }
      const { channel, record } = await authorizedTicket(
        guild,
        actor,
        snowflake.parse(resource.split("/")[1]),
      );
      const messages = await channel.messages.fetch({ limit: 100 });
      return {
        id: channel.id,
        name: channel.name,
        ...record,
        messages: [...messages.values()].reverse().map((m) => ({
          id: m.id,
          author: m.author.username,
          authorId: m.author.id,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
          attachments: m.attachments.map((a) => ({ name: a.name, url: a.url })),
          embeds: m.embeds.map((e) => ({ title: e.title, description: e.description })),
        })),
        truncated: messages.size === 100,
      };
    }
    if (resource === "ticket-profiles") {
      requireCapability(capabilities, "settings");
      return Promise.all(
        this.application.extensions(ticketDashboardToken).map(async ({ value: port }) => ({
          id: port.id,
          profiles: await port.profiles(guild, actor),
        })),
      );
    }
    if (resource === "commands") {
      requireCapability(capabilities, "commands");
      const custom = this.application.isEnabled("custom-commands")
        ? await this.application.resolve(customCommandsToken).listCommands(guildId)
        : [];
      const legacy = this.application.isEnabled("custom-commands")
        ? await this.application.resolve(legacyResponsesToken).list(guildId)
        : [];
      return {
        builtins: commandCatalog(this.client, this.application),
        custom,
        legacy,
        prefix: this.application.isEnabled("custom-commands")
          ? this.application.resolve(customCommandOptionsToken).prefix
          : null,
        configuration: this.config.customization.commands,
      };
    }
    if (resource === "settings") {
      requireCapability(capabilities, "settings");
      return {
        config,
        warningRoleSettings: warningRoleSettings(config.warningRoleSettings),
        commandRoleAccess: commandRoleAccess(config.commandRoleAccess),
        restartSettings: {
          bot: this.config.customization.bot,
          commands: this.config.customization.commands,
          modules: this.application.list().map((m) => ({ id: m.id, enabled: m.enabled })),
        },
      };
    }
    if (resource === "resources") {
      return {
        channels: [...(await guild.channels.fetch()).values()]
          .filter((c) => c && c.permissionsFor(actor)?.has(P.ViewChannel))
          .map((c) => ({ id: c!.id, name: c!.name, type: c!.type })),
        roles: [...(await guild.roles.fetch()).values()].map((r) => ({
          id: r.id,
          name: r.name,
          managed: r.managed,
          position: r.position,
        })),
        botId: guild.members.me?.id,
      };
    }
    if (resource === "workflows") {
      requireCapability(capabilities, "commands");
      return this.store.workflows(guildId);
    }
    if (resource === "plugins") {
      requireCapability(capabilities, "plugins");
      const manager = this.application.resolve(pluginManagerToken);
      return {
        extensions: this.extensions().map((e) => e.manifest),
        activations: await this.store.plugins(guildId),
        installed: await manager.installed(),
        catalog: (await manager.catalog()).map((e) => ({ manifest: e.manifest, sha256: e.sha256 })),
        operator: capabilities.includes("operator"),
        installation:
          "Global package installation and code changes require the trusted operator terminal installer. Restart Centerify after changes.",
      };
    }
    if (resource === "xp") {
      requireCapability(capabilities, "settings");
      return this.store.database.orm.public.MemberXp.where({ guildId })
        .orderBy((x) => x.xp.desc())
        .limit(100)
        .all();
    }
    if (resource === "audit") {
      requireCapability(capabilities, "settings");
      return this.store.recent(guildId, 100);
    }
    throw new DashboardError(404, "Dashboard resource not found");
  }

  async mutate(actorId: string, guildId: string, resource: string, raw: unknown, key: string) {
    const a = await this.access(actorId, guildId);
    if (!a.verified)
      throw new DashboardError(
        403,
        "The server owner must run /verify in Discord before making changes",
      );
    return this.store.once(guildId, actorId, key, { resource, raw }, () =>
      withApplication(this.application, async () => {
        // Recheck after the durable operation reservation.
        const { guild, actor, capabilities, config } = await this.access(actorId, guildId);
        if (resource === "moderation") {
          requireCapability(capabilities, "moderation");
          const input = moderationSchema.parse(raw);
          const channel = await this.channel(guild, actor, input.channelId);
          const results = [];
          for (const userId of [...new Set(input.userIds)]) {
            try {
              const action: EffectAction =
                input.action === "addrole" || input.action === "removerole"
                  ? { action: input.action, roleId: input.roleId!, userId }
                  : input.action === "timeout"
                    ? {
                        action: "timeout",
                        userId,
                        reason: input.reason,
                        durationMs: input.durationMs!,
                      }
                    : {
                        action: input.action,
                        userId,
                        reason: input.reason,
                        ...(input.action === "warn" && input.durationMs
                          ? { durationMs: input.durationMs }
                          : {}),
                      };
              const result = await this.effect(guild, actor, channel, action);
              const caseNumber = /Case #(\d+)/.exec(result)?.[1];
              if (input.evidence && caseNumber) {
                const latest = await this.store.database.orm.public.ModerationCase.where({
                  guildId,
                  targetUserId: userId,
                  moderatorUserId: actorId,
                  caseNumber: Number(caseNumber),
                }).first();
                if (latest)
                  await this.store.database.orm.public.ModerationCase.where({
                    id: latest.id,
                    guildId,
                  }).update({
                    metadata: {
                      ...(latest.metadata &&
                      typeof latest.metadata === "object" &&
                      !Array.isArray(latest.metadata)
                        ? latest.metadata
                        : {}),
                      evidence: input.evidence,
                    },
                  });
              }
              results.push({ userId, status: "succeeded", message: result });
            } catch (error) {
              results.push({
                userId,
                status: "failed",
                message: error instanceof Error ? error.message.slice(0, 500) : "Action failed",
              });
            }
          }
          await this.store.emit(
            guildId,
            "moderation.changed",
            `${input.action}: ${results.filter((r) => r.status === "succeeded").length}/${results.length} completed`,
            actorId,
          );
          return { results };
        }
        if (resource === "settings") {
          requireCapability(capabilities, "settings");
          const input = z
            .object({ expectedUpdatedAt: z.string(), patch: settingsPatchSchema })
            .strict()
            .parse(raw);
          const patch = { ...input.patch } as GuildConfigUpdate;
          const effective = { ...config, ...patch };
          if (effective.welcomeEnabled && !effective.welcomeChannelId)
            throw new DashboardError(
              400,
              "Choose a welcome channel before enabling welcome messages",
            );
          if (effective.goodbyeEnabled && !effective.goodbyeChannelId)
            throw new DashboardError(
              400,
              "Choose a goodbye channel before enabling goodbye messages",
            );
          if (effective.loggingEnabled && !effective.loggingChannelId)
            throw new DashboardError(400, "Choose a logging channel before enabling logging");
          if (effective.autoRoleEnabled && !effective.autoRoleId)
            throw new DashboardError(
              400,
              "Choose an automatic role before enabling role assignment",
            );
          if (patch.warningRoleSettings !== undefined)
            patch.warningRoleSettings = warningRoleSettings(patch.warningRoleSettings);
          if (patch.commandRoleAccess !== undefined)
            patch.commandRoleAccess = commandRoleAccess(patch.commandRoleAccess);
          for (const channelId of [
            patch.welcomeChannelId,
            patch.goodbyeChannelId,
            patch.loggingChannelId,
          ])
            if (channelId) {
              const channel = await guild.channels.fetch(channelId);
              if (
                !isUsableTextChannel(channel) ||
                !canSendToChannel(guild, channel) ||
                !channel.permissionsFor(actor)?.has(P.ViewChannel)
              )
                throw new DashboardError(
                  400,
                  "Choose a visible text channel where Centerify can send messages",
                );
            }
          if (patch.autoRoleId) {
            const role = await guild.roles.fetch(patch.autoRoleId);
            if (!role) throw new DashboardError(400, "Role not found");
            const error = validateAssignableRole(guild, role, actor);
            if (error) throw new DashboardError(403, error);
          }
          if (patch.ticketSettings) {
            const category = await guild.channels.fetch(patch.ticketSettings.categoryId),
              role = await guild.roles.fetch(patch.ticketSettings.supportRoleId);
            if (
              !category ||
              category.type !== ChannelType.GuildCategory ||
              !category.permissionsFor(actor)?.has([P.ViewChannel, P.ManageChannels]) ||
              !role ||
              role.managed ||
              role.id === guildId ||
              role.position >= (guild.members.me?.roles.highest.position ?? 0) ||
              (actor.id !== guild.ownerId && role.position >= actor.roles.highest.position)
            )
              throw new DashboardError(
                400,
                "Ticket category and dedicated support role must be accessible and below the actor and bot roles",
              );
          }
          if (config.updatedAt !== input.expectedUpdatedAt)
            throw new DashboardError(409, "Settings changed elsewhere. Reload before saving.");
          const repository = this.application.resolve(guildConfigToken);
          if (!repository.updateIfCurrent)
            throw new DashboardError(
              503,
              "This configuration repository does not support concurrent dashboard edits",
            );
          const saved = await repository.updateIfCurrent(guildId, patch, input.expectedUpdatedAt);
          if (!saved)
            throw new DashboardError(409, "Settings changed elsewhere. Reload before saving.");
          await this.store.emit(guildId, "config.changed", "Server settings updated", actorId, {
            fields: Object.keys(patch),
          });
          return saved;
        }
        if (resource.startsWith("tickets/")) {
          requireCapability(capabilities, "tickets");
          const channelId = snowflake.parse(resource.split("/")[1]);
          for (const { value: port } of this.application.extensions(ticketDashboardToken)) {
            if (await port.read(guild, actor, channelId)) {
              const denial = commandRoleDenial(
                config.commandRoleAccess,
                "bticket",
                new Set(actor.roles.cache.keys()),
              );
              if (denial) throw new DashboardError(403, denial);
              const result = await port.mutate(guild, actor, channelId, raw);
              await this.store.emit(
                guildId,
                "ticket.changed",
                `${port.id} ticket updated`,
                actorId,
                { channelId },
              );
              return result;
            }
          }
          const input = z
            .object({ action: z.enum(["close", "reopen"]) })
            .strict()
            .parse(raw);
          const result = await changeTicketState(
            guild,
            actor,
            channelId,
            input.action === "close" ? "closed" : "open",
          );
          await this.store.emit(guildId, "ticket.changed", `Ticket ${input.action}`, actorId, {
            channelId,
          });
          return result;
        }
        if (resource === "ticket-profiles") {
          requireCapability(capabilities, "settings");
          const input = z
            .object({
              pluginId: z.string(),
              profile: z.unknown(),
              revision: z.number().int().min(0),
            })
            .strict()
            .parse(raw);
          const port = this.application
            .extensions(ticketDashboardToken)
            .find((e) => e.value.id === input.pluginId)?.value;
          if (!port)
            throw new DashboardError(
              409,
              "This ticket plugin is not installed or does not expose a dashboard adapter",
            );
          const result = await port.configure(guild, actor, {
            profile: input.profile,
            revision: input.revision,
          });
          await this.store.emit(
            guildId,
            "ticket.changed",
            "Ticket department configuration updated",
            actorId,
          );
          return result;
        }
        if (resource === "commands") {
          requireCapability(capabilities, "commands");
          if (!this.application.isEnabled("custom-commands"))
            throw new DashboardError(409, "The custom commands module is disabled");
          const input = z
            .object({
              action: z.enum(["create", "update", "delete", "import", "diagnose"]),
              name: z.string().optional(),
              definition: z.unknown().optional(),
              expectedUpdatedAt: z.string().optional(),
              channelId: snowflake.optional(),
              userId: snowflake.optional(),
              file: z.string().max(500000).optional(),
            })
            .strict()
            .parse(raw);
          const commands = this.application.resolve(customCommandsToken);
          let result: unknown;
          if (input.action === "create")
            result = await commands.createCommand(guildId, actorId, input.definition);
          if (input.action === "update") {
            if (!input.name || !input.expectedUpdatedAt)
              throw new DashboardError(400, "Command name and revision are required");
            result = await commands.updateCommand(
              guildId,
              actorId,
              input.name,
              input.definition as never,
              "dashboard.updated",
              input.expectedUpdatedAt,
            );
          }
          if (input.action === "delete")
            result = await commands.deleteCommand(guildId, actorId, z.string().parse(input.name));
          if (input.action === "import")
            result = {
              count: await commands.importCommands(guildId, actorId, z.string().parse(input.file)),
            };
          if (input.action === "diagnose") {
            const member = await guild.members.fetch({
              user: input.userId ?? actorId,
              force: true,
            });
            const channel = await this.channel(guild, actor, snowflake.parse(input.channelId));
            const command = await commands.getCommandByNameOrAlias(
              guildId,
              z.string().parse(input.name),
            );
            if (!command) throw new DashboardError(404, "Command not found");
            let allowed = true,
              explanation = "All command, role, channel and Discord permission checks passed";
            try {
              new CustomCommandPermissionService().check({
                guildId,
                channelId: channel.id,
                userId: member.id,
                guild,
                member,
                channel,
                command,
                args: [],
                source: "internal",
              });
            } catch (error) {
              allowed = false;
              explanation = error instanceof Error ? error.message : "Denied";
            }
            return { allowed, explanation };
          }
          await this.store.emit(
            guildId,
            "command.changed",
            `Custom command ${input.action}`,
            actorId,
          );
          return result;
        }
        if (resource === "reports") {
          requireCapability(capabilities, "moderation");
          if (!actor.permissions.has(P.ModerateMembers))
            throw new DashboardError(403, "Moderate Members permission is required");
          const input = z
            .object({
              number: z.number().int().positive(),
              status: z.enum(["ACCEPTED", "REJECTED"]),
            })
            .strict()
            .parse(raw);
          return this.application.resolve(reportsToken).updateStatus({
            guildId,
            reportNumber: input.number,
            reviewedBy: actorId,
            status: input.status,
          });
        }
        if (resource === "plugins") {
          requireCapability(capabilities, "plugins");
          const input = z
            .object({
              id: z.string(),
              enabled: z.boolean(),
              config: z.unknown(),
              revision: z.number().int().min(0),
            })
            .strict()
            .parse(raw);
          const ext = this.extensions().find((e) => e.manifest.id === input.id);
          if (!ext)
            throw new DashboardError(400, "This plugin has no compatible dashboard extension");
          const result = await this.store.setPlugin(
            guildId,
            input.id,
            input.enabled,
            ext.settings.parse(input.config),
            input.revision,
          );
          await this.store.emit(
            guildId,
            "plugin.changed",
            `${ext.manifest.name} ${input.enabled ? "enabled" : "disabled"}`,
            actorId,
          );
          return result;
        }
        if (resource === "workflows") {
          requireCapability(capabilities, "commands");
          const input = z
            .object({
              action: z.enum(["save", "publish", "disable", "rollback", "test", "cancel"]),
              name: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/),
              revision: z.number().int().min(0),
              definition: z.unknown().optional(),
              version: z.number().int().optional(),
              channelId: snowflake.optional(),
              args: z.array(z.string().max(100)).max(25).default([]),
              runId: z.string().uuid().optional(),
            })
            .strict()
            .parse(raw);
          if (input.action === "cancel") {
            const run = this.runs.get(input.runId ?? "");
            if (!run || run.guildId !== guildId || run.actorId !== actorId)
              throw new DashboardError(404, "Your active run was not found");
            run.controller.abort();
            return { cancelled: true };
          }
          const current = await this.store.workflow(guildId, input.name);
          if (input.action === "disable") {
            if (!current) throw new DashboardError(404, "Workflow not found");
            return this.store.saveWorkflow(
              guildId,
              actorId,
              input.name,
              current.draft,
              input.revision,
              undefined,
              false,
            );
          }
          let definition = input.definition;
          if (input.action === "rollback") {
            const history = Array.isArray(current?.history) ? current.history : [];
            const entry = history.find(
              (v) => v && typeof v === "object" && "revision" in v && v.revision === input.version,
            );
            if (!entry || typeof entry !== "object" || !("definition" in entry))
              throw new DashboardError(404, "Workflow version not found");
            definition = entry.definition;
          }
          const checked =
            input.action === "save"
              ? workflowSchema.parse(definition)
              : checkedWorkflow(
                  definition,
                  this.extensions().flatMap((e) =>
                    e.manifest.nodes.map((n) => `${e.manifest.id}:${n.id}`),
                  ),
                );
          if (checked.name !== input.name)
            throw new DashboardError(400, "Workflow names must match");
          if (
            this.application.resolve(customCommandsToken).isReserved(checked.name) ||
            (await this.application
              .resolve(customCommandsToken)
              .getCommandByNameOrAlias(guildId, checked.name))
          )
            throw new DashboardError(
              409,
              "Choose a name that is not used by a built-in command, custom command or alias",
            );
          if (input.action === "test")
            return this.runWorkflow(
              guild,
              actor,
              await this.channel(guild, actor, snowflake.parse(input.channelId)),
              checked,
              true,
              input.args,
              input.runId,
            );
          const publish = input.action === "publish" || input.action === "rollback";
          if (publish) await this.validatePublish(guild, actor, checked);
          const result = await this.store.saveWorkflow(
            guildId,
            actorId,
            input.name,
            checked,
            input.revision,
            publish ? checked : undefined,
            publish ? true : undefined,
          );
          await this.store.emit(guildId, "workflow.changed", `Workflow ${input.action}`, actorId, {
            name: input.name,
          });
          return result;
        }
        throw new DashboardError(404, "Dashboard operation not found");
      }),
    );
  }
  async account(actorId: string, input: unknown) {
    const parsed = z
      .object({ name: z.string().trim().min(1).max(100).optional(), theme: themeSchema.optional() })
      .strict()
      .parse(input);
    return this.store.account(actorId, parsed.name, parsed.theme);
  }
  async channel(guild: Guild, actor: GuildMember, id: string): Promise<GuildTextBasedChannel> {
    const channel = await guild.channels.fetch(id, { force: true });
    if (
      !channel ||
      !channel.isTextBased() ||
      !channel.permissionsFor(actor)?.has([P.ViewChannel, P.SendMessages])
    )
      throw new DashboardError(
        403,
        "Choose a server text channel you can view and send messages in",
      );
    return channel;
  }
  async effect(
    guild: Guild,
    actor: GuildMember,
    channel: GuildTextBasedChannel,
    action: EffectAction,
  ) {
    const config = await this.application.resolve(guildConfigToken).getOrCreate(guild.id);
    const canonical =
      action.action === "removetimeout"
        ? "timeout"
        : action.action === "addrole" || action.action === "removerole"
          ? "role"
          : action.action;
    const denial = commandRoleDenial(
      config.commandRoleAccess,
      canonical,
      new Set(actor.roles.cache.keys()),
    );
    if (denial) throw new DashboardError(403, denial);
    if (action.action === "warn") {
      const moderator = await guild.members.fetch({ user: actor.id, force: true }),
        target = await guild.members.fetch({ user: action.userId, force: true }),
        me = await guild.members.fetchMe({ force: true });
      if (!moderator.permissions.has(P.ModerateMembers))
        throw new DashboardError(403, "Moderate Members permission is required");
      if (
        !(await this.application.resolve(guildOwnershipToken).isVerified(guild.id, guild.ownerId))
      )
        throw new DashboardError(403, "Server verification is required");
      const invalid = validateMemberAction({ guild, moderator, target });
      if (invalid) throw new DashboardError(403, invalid);
      if (target.user.bot || target.user.system || !target.manageable)
        throw new DashboardError(403, "Choose a member who can be warned");
      const settings = warningRoleSettings(config.warningRoleSettings),
        durationMs = action.durationMs ?? settings.defaultDurationMs;
      if (settings.mode !== "none" && !me.permissions.has(P.ManageRoles))
        throw new DashboardError(
          403,
          "Centerify needs Manage Roles for the configured warning policy",
        );
      const result = await this.application.resolve(warnMemberKey).execute(
        {
          guildId: guild.id,
          targetUserId: target.id,
          moderatorUserId: moderator.id,
          reason: action.reason,
          durationMs,
        },
        {
          prepareRole: async (_, count) => {
            const role = await getOrCreateWarnRole(guild, count, settings);
            if (!role) return { id: null, name: "No role", error: null };
            const roleError = validateAssignableRole(guild, role, moderator);
            if (!roleError) await applyWarningRoleStyle(role, settings);
            return { id: role.id, name: role.name, error: roleError };
          },
          assignRole: async (_, id) => {
            await target.roles.add(id, `Centerify warning by ${moderator.id}`);
          },
        },
      );
      if (result.status === "rejected") throw new DashboardError(403, result.reason);
      if (durationMs) scheduleWarningRoleRemoval(guild.client, result.moderationCase);
      return `Warning added — Case #${result.moderationCase.caseNumber}.`;
    }
    const command = {
      id: 0,
      guildId: guild.id,
      ...this.application.resolve(customCommandsToken).validator.definition({
        name: "dashboard-action",
        content: [{ type: "TEXT", text: "Dashboard action" }],
      }),
      createdBy: actor.id,
      updatedBy: actor.id,
      createdAt: "",
      updatedAt: "",
      usageCount: 0,
      lastUsedAt: null,
    } as CustomCommandRecord;
    return new ComponentActionExecutor().execute(
      {
        guildId: guild.id,
        channelId: channel.id,
        userId: actor.id,
        guild,
        member: actor,
        channel,
        command,
        args: [],
        source: "internal",
      },
      action,
      async () => command,
      () => true,
    );
  }
  async validatePublish(guild: Guild, actor: GuildMember, w: Workflow) {
    const activations = await this.store.plugins(guild.id);
    for (const node of w.nodes.filter((n) => n.kind === "plugin")) {
      const pluginId = String(node.config.action).split(":")[0];
      if (!activations.some((p) => p.pluginId === pluginId && p.enabled))
        throw new DashboardError(
          409,
          "Install this plugin globally and enable it for this server before publishing its nodes",
        );
    }
    if (
      w.nodes.find((n) => n.kind === "trigger")?.config.event === "memberJoin" &&
      actor.id !== guild.ownerId
    )
      throw new DashboardError(403, "Only the server owner can publish member-join workflows");
    for (const node of w.nodes.filter((n) => n.kind === "action")) {
      const permission =
        node.config.action === "ban" || node.config.action === "unban"
          ? P.BanMembers
          : node.config.action === "kick"
            ? P.KickMembers
            : node.config.action === "addrole" || node.config.action === "removerole"
              ? P.ManageRoles
              : P.ModerateMembers;
      if (!actor.permissions.has(permission))
        throw new DashboardError(
          403,
          `You cannot publish ${node.config.action} without its Discord permission`,
        );
    }
  }
  async runWorkflow(
    guild: Guild,
    actor: GuildMember,
    channel: GuildTextBasedChannel,
    w: Workflow,
    test: boolean,
    args: string[],
    runId: string = crypto.randomUUID(),
  ) {
    if (this.runs.size >= 100) throw new DashboardError(429, "Workflow capacity reached");
    if (this.runs.has(runId)) throw new DashboardError(409, "Run ID is already active");
    const controller = new AbortController();
    this.runs.set(runId, { actorId: actor.id, guildId: guild.id, controller });
    const respond = async (text: string) => {
      if (controller.signal.aborted) throw new DashboardError(408, "Cancelled");
      await channel.send({ content: text, allowedMentions: { parse: [] } });
    };
    try {
      const result = await executeWorkflow(
        w,
        {
          authorize: async () => {
            const a = await this.access(actor.id, guild.id, test);
            if (!a.verified) throw new DashboardError(403, "Server verification is required");
            if (!test) {
              const current = await this.store.workflow(guild.id, w.name);
              if (!current?.enabled || JSON.stringify(current.published) !== JSON.stringify(w))
                throw new DashboardError(409, "Workflow changed or was disabled");
            }
            await this.channel(guild, a.actor, channel.id);
          },
          permission: async (name) =>
            (await guild.members.fetch({ user: actor.id, force: true })).permissions.has(
              P[name as keyof typeof P],
            ),
          cooldown: async (id, seconds) => {
            const now = Date.now();
            for (const [k, until] of this.cooldowns) if (until < now) this.cooldowns.delete(k);
            const key = `${guild.id}:${w.name}:${id}:${actor.id}`;
            if ((this.cooldowns.get(key) ?? 0) > now) return false;
            if (this.cooldowns.size > 100000)
              throw new DashboardError(429, "Cooldown capacity reached");
            this.cooldowns.set(key, now + seconds * 1000);
            return true;
          },
          action: async (node, values) => {
            const c = node.config,
              text = interpolate(c.text, values);
            const fresh = await guild.members.fetch({ user: actor.id, force: true });
            if (["response", "error"].includes(node.kind)) {
              await respond(text);
              return "Response sent";
            }
            if (node.kind === "embed") {
              await channel.send({
                embeds: [
                  {
                    title: String(c.title ?? "").slice(0, 256) || undefined,
                    description: text,
                    color: Number(c.color ?? 0xa78bfa),
                  },
                ],
                allowedMentions: { parse: [] },
              });
              return "Embed sent";
            }
            if (node.kind === "components") {
              if (c.url)
                await channel.send({
                  content: text,
                  components: [
                    new ActionRowBuilder<ButtonBuilder>().addComponents(
                      new ButtonBuilder()
                        .setStyle(ButtonStyle.Link)
                        .setURL(String(c.url))
                        .setLabel(String(c.label ?? "Learn more").slice(0, 80)),
                    ),
                  ],
                  allowedMentions: { parse: [] },
                });
              else
                await channel.send({
                  content: text,
                  components: [
                    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                      new StringSelectMenuBuilder()
                        .setCustomId("centerify:workflow:preview")
                        .setPlaceholder("Informational options")
                        .setDisabled(true)
                        .addOptions(
                          (c.options as string[]).map((o, i) => ({
                            label: String(o).slice(0, 100),
                            value: String(i),
                          })),
                        ),
                    ),
                  ],
                  allowedMentions: { parse: [] },
                });
              return c.url
                ? "Link button sent"
                : "Informational select menu sent (no action handler)";
            }
            if (node.kind === "action")
              return this.effect(guild, fresh, channel, this.nodeEffect(node, values));
            if (node.kind === "ticket") {
              await changeTicketState(
                guild,
                fresh,
                channel.id,
                c.action === "close" ? "closed" : "open",
              );
              return "Ticket updated";
            }
            if (node.kind === "plugin") {
              const [pluginId, action] = String(c.action).split(":");
              const extension = this.extensions().find((e) => e.manifest.id === pluginId);
              const activation = (await this.store.plugins(guild.id)).find(
                (p) => p.pluginId === pluginId,
              );
              if (
                !extension ||
                !activation?.enabled ||
                !extension.manifest.capabilities.includes("bot.respond")
              )
                throw new DashboardError(
                  409,
                  "Plugin is disabled or missing its response capability",
                );
              return extension.execute(action!, {
                config: activation.config as Record<string, unknown>,
                text,
                respond,
              });
            }
            throw new DashboardError(400, "Unsupported action");
          },
        },
        {
          test,
          args,
          actorId: actor.id,
          signal: controller.signal,
          pluginActions: this.pluginActions(),
        },
      );
      await this.store.emit(
        guild.id,
        "workflow.executed",
        `${test ? "Test" : "Run"} ${w.name}: ${result.status}`,
        actor.id,
        { runId, name: w.name, status: result.status, trace: result.trace },
      );
      return { runId, ...result };
    } finally {
      this.runs.delete(runId);
    }
  }
  nodeEffect(
    node: WorkflowNode,
    values: ReadonlyMap<string, string | number | boolean>,
  ): EffectAction {
    const c = node.config,
      userId = snowflake.parse(interpolate(c.userId, values)),
      reason = interpolate(c.reason, values);
    if (c.action === "addrole" || c.action === "removerole")
      return { action: c.action, userId, roleId: snowflake.parse(c.roleId) };
    if (c.action === "timeout")
      return { action: "timeout", userId, reason, durationMs: Number(c.durationMs) };
    return { action: c.action, userId, reason } as EffectAction;
  }
  stop() {
    for (const run of this.runs.values()) run.controller.abort();
  }
}
