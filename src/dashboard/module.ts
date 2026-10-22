import { Command, type SapphireClient } from "@sapphire/framework";
import { Events, InteractionContextType, MessageFlags, PermissionFlagsBits as P } from "discord.js";
import { type ModuleRegistry, eventsToken, loggerToken } from "../core/index.js";
import { discordEvent, withDiscord } from "../adapters/discord/modules.js";
import { withApplication } from "../adapters/discord/context.js";
import type { EnvironmentConfiguration } from "../bootstrap/config.js";
import { DashboardService } from "./service.js";
import { startDashboardBridge } from "./bridge.js";
import { checkedWorkflow } from "./workflows.js";
import { eventOperationKey } from "./security.js";

export function createDashboardModule(
  client: SapphireClient,
  getApplication: () => ModuleRegistry,
  config: EnvironmentConfiguration,
) {
  let service: DashboardService,
    bridge: Awaited<ReturnType<typeof startDashboardBridge>> | undefined;
  class FlowCommand extends Command {
    override registerApplicationCommands(registry: Command.Registry) {
      registry.registerChatInputCommand((builder) =>
        builder
          .setName("flow")
          .setDescription("Run a published Centerify workflow")
          .setContexts(InteractionContextType.Guild)
          .addStringOption((o) =>
            o.setName("name").setDescription("Published workflow name").setRequired(true),
          )
          .addStringOption((o) =>
            o.setName("arguments").setDescription("Space-separated arguments"),
          ),
      );
    }
    override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        if (!interaction.inCachedGuild()) throw new Error("Run workflows in a server");
        const saved = await service.store.workflow(
          interaction.guildId,
          interaction.options.getString("name", true),
        );
        if (!saved?.enabled || !saved.published) throw new Error("This workflow is not published");
        const definition = checkedWorkflow(saved.published, service.pluginActions());
        if (definition.nodes.find((n) => n.kind === "trigger")?.config.event !== "command")
          throw new Error("This workflow uses an event trigger");
        const actor = await interaction.guild.members.fetch({
          user: interaction.user.id,
          force: true,
        });
        const channel = await service.channel(interaction.guild, actor, interaction.channelId);
        const result = await service.store.once(
          interaction.guildId,
          actor.id,
          eventOperationKey(interaction.id),
          { workflow: definition.name, interactionId: interaction.id },
          () =>
            service.runWorkflow(
              interaction.guild,
              actor,
              channel,
              definition,
              false,
              (interaction.options.getString("arguments") ?? "").split(/\s+/).filter(Boolean),
            ),
        );
        await interaction.editReply({
          content: `Workflow ${result.status}. ${result.trace.length} steps. Run ${result.runId}`,
          allowedMentions: { parse: [] },
        });
      } catch (error) {
        await interaction.editReply({
          content: error instanceof Error ? error.message.slice(0, 1800) : "Workflow failed",
          allowedMentions: { parse: [] },
        });
      }
    }
  }
  const pending = new Set<Promise<unknown>>();
  const record = (
    guildId: string,
    type: string,
    summary: string,
    actorId: string | null = null,
  ) => {
    const job = service.store
      .emit(guildId, type, summary, actorId)
      .catch(() =>
        getApplication()
          .resolve(loggerToken)
          .error({ event: type }, "Dashboard event persistence failed"),
      );
    pending.add(job);
    void job.finally(() => pending.delete(job));
  };
  return withDiscord(
    {
      metadata: {
        id: "dashboard",
        name: "Web dashboard bridge",
        version: "1.0.0",
        dependsOn: ["guilds", "plugins", "custom-commands"],
      },
      register(context) {
        service = new DashboardService(client, getApplication(), config);
        const bus = context.resolve(eventsToken);
        for (const type of ["command.executed", "moderation.changed"])
          context.onStop(
            bus.subscribe<{ type: string; guildId: string; actorId: string; name?: string }>(
              type,
              (e) => {
                record(
                  e.guildId,
                  e.type,
                  e.name ? `/${e.name} executed` : "Moderation case updated",
                  e.actorId,
                );
              },
            ),
          );
      },
      async start() {
        bridge = await startDashboardBridge(service);
      },
      async stop() {
        await bridge?.close();
        await Promise.allSettled(pending);
      },
    },
    async () => ({
      commands: { flow: FlowCommand },
      events: [
        discordEvent(Events.GuildMemberAdd, async (member) => {
          record(member.guild.id, "member.join", "A member joined", member.id);
          const flows = await service.store.workflows(member.guild.id);
          for (const flow of flows.filter((f) => f.enabled && f.published)) {
            const definition = checkedWorkflow(flow.published, service.pluginActions()),
              trigger = definition.nodes.find((n) => n.kind === "trigger");
            if (trigger?.config.event !== "memberJoin") continue;
            const owner = await member.guild.members
              .fetch({ user: flow.updatedBy, force: true })
              .catch(() => null);
            if (
              !owner ||
              owner.id !== member.guild.ownerId ||
              !owner.permissions.has(P.ManageGuild)
            )
              continue;
            try {
              const channel = await service.channel(
                member.guild,
                owner,
                String(trigger.config.channelId),
              );
              await withApplication(getApplication(), () =>
                service.store.once(
                  member.guild.id,
                  owner.id,
                  eventOperationKey(
                    `${member.guild.id}:${member.id}:${member.joinedTimestamp}:${definition.name}`,
                  ),
                  { workflow: definition.name, event: "memberJoin", memberId: member.id },
                  () =>
                    service.runWorkflow(member.guild, owner, channel, definition, false, [
                      member.id,
                    ]),
                ),
              );
            } catch {
              record(
                member.guild.id,
                "workflow.failed",
                `Member join workflow ${flow.name} failed`,
              );
            }
          }
        }),
        discordEvent(Events.GuildMemberRemove, (member) =>
          record(member.guild.id, "member.leave", "A member left", member.id),
        ),
        discordEvent(Events.GuildMemberUpdate, (_, member) =>
          record(member.guild.id, "member.changed", "Member roles or profile changed", member.id),
        ),
        discordEvent(Events.GuildBanAdd, (ban) =>
          record(ban.guild.id, "moderation.ban", "A ban was added", ban.user.id),
        ),
        discordEvent(Events.GuildBanRemove, (ban) =>
          record(ban.guild.id, "moderation.unban", "A ban was removed", ban.user.id),
        ),
        discordEvent(Events.ChannelUpdate, (_, channel) => {
          if ("guild" in channel)
            record(channel.guild.id, "ticket.changed", "A server channel changed");
        }),
        discordEvent(Events.ChannelCreate, (channel) =>
          record(channel.guild.id, "ticket.changed", "A server channel was created"),
        ),
        discordEvent(Events.ChannelDelete, (channel) => {
          if ("guild" in channel)
            record(channel.guild.id, "ticket.changed", "A server channel was deleted");
        }),
      ],
    }),
  );
}
