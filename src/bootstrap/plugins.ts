import { Command } from "@sapphire/framework";
import * as discord from "discord.js";
import { z } from "zod";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { withDiscord } from "../adapters/discord/modules.js";
import type { CenterifyModule } from "../core/index.js";
import { LocalPluginRegistry } from "../modules/plugins/infrastructure/LocalPluginRegistry.js";
import { FilePluginStorage } from "../modules/plugins/infrastructure/FilePluginStorage.js";
import { packageHash, within, checkedDirectory } from "../modules/plugins/infrastructure/files.js";
import { commandRoleDenial } from "../modules/guilds/index.js";
import {
  guildConfigService,
  guildOwnershipService,
  requireVerifiedOwnership,
} from "../modules/guilds/discord/index.js";
import { logger } from "../adapters/logging/runtime.js";
import type { PluginFactory } from "../modules/plugins/discord/sdk.js";
import { dashboardExtensionSchema, dashboardExtensionToken } from "../dashboard/extensions.js";
import { ticketDashboardToken } from "../dashboard/ticketPort.js";

export async function loadInstalledPlugins(
  manager: LocalPluginRegistry,
): Promise<CenterifyModule[]> {
  const result: CenterifyModule[] = [];
  for (const entry of Object.values((await manager.installed()).plugins)) {
    if (!entry.enabled) continue;
    const root = await checkedDirectory(
      manager.projectRoot,
      manager.packagePath(entry.manifest.id, entry.manifest.version),
    );
    if ((await packageHash(root)) !== entry.sha256)
      throw new Error(`Installed plugin ${entry.manifest.id} failed its integrity check`);
    const entrypoint = within(root, entry.manifest.entrypoint);
    const imported: { default?: PluginFactory } = await import(pathToFileURL(entrypoint).href);
    if (typeof imported.default !== "function")
      throw new Error(`Plugin ${entry.manifest.id} has no default factory`);
    const plugin = await imported.default({
      apiVersion: 1,
      Command,
      discord,
      z,
      storage: new FilePluginStorage(manager.stateRoot, entry.manifest.id),
      verified: (guild) => guildOwnershipService.isVerified(guild),
      logError: (error, context) =>
        logger.error({ err: error, plugin: entry.manifest.id }, context),
      async authorize(interaction, commandName) {
        if (!(await requireVerifiedOwnership(interaction)) || !interaction.inCachedGuild())
          return false;
        const [member, config] = await Promise.all([
          interaction.guild.members.fetch({ user: interaction.user.id, force: true }),
          guildConfigService.getOrCreate(interaction.guildId),
        ]);
        const denial = commandRoleDenial(
          config.commandRoleAccess,
          commandName,
          new Set(member.roles.cache.keys()),
        );
        if (denial) {
          await interaction.editReply({ content: denial, allowedMentions: { parse: [] } });
          return false;
        }
        return true;
      },
    });
    if (
      plugin.module.metadata.id !== entry.manifest.id ||
      plugin.module.metadata.version !== entry.manifest.version
    )
      throw new Error(`Plugin ${entry.manifest.id} metadata does not match its manifest`);
    if (plugin.module.metadata.dependsOn?.some((id) => !entry.manifest.dependencies.includes(id)))
      throw new Error(`Plugin ${entry.manifest.id} has undeclared dependencies`);
    if (plugin.dashboard) {
      const dashboard = dashboardExtensionSchema.parse(plugin.dashboard.manifest);
      if (
        dashboard.id !== entry.manifest.id ||
        dashboard.version !== entry.manifest.version ||
        dashboard.capabilities.some(
          (capability) => !entry.manifest.permissions.includes(capability),
        ) ||
        dashboard.dependencies.some((id) => !entry.manifest.dependencies.includes(id))
      )
        throw new Error(
          `Plugin ${entry.manifest.id} has undeclared dashboard capabilities or mismatched identity`,
        );
    }
    if (
      plugin.tickets &&
      (plugin.tickets.id !== entry.manifest.id ||
        !entry.manifest.permissions.includes("dashboard.tickets"))
    )
      throw new Error(`Plugin ${entry.manifest.id} has undeclared dashboard ticket access`);
    result.push(
      withDiscord(
        {
          ...plugin.module,
          async register(context) {
            await plugin.module.register(context);
            if (plugin.dashboard) context.contribute(dashboardExtensionToken, plugin.dashboard);
            if (plugin.tickets) context.contribute(ticketDashboardToken, plugin.tickets);
          },
          metadata: {
            ...plugin.module.metadata,
            dependsOn: [...new Set(["plugins", ...entry.manifest.dependencies])],
          },
        },
        async () => plugin.discord,
      ),
    );
  }
  return result;
}

export function defaultPluginManager(stateDirectory = process.env.CENTERIFY_PLUGIN_STATE_DIR) {
  return new LocalPluginRegistry(
    process.cwd(),
    stateDirectory || join(process.cwd(), ".centerify"),
  );
}
