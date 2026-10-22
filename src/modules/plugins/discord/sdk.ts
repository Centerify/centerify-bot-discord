import { Command } from "@sapphire/framework";
import * as discord from "discord.js";
import { z } from "zod";
import type { CenterifyModule } from "../../../core/index.js";
import type { DiscordModule } from "../../../adapters/discord/modules.js";
import type { PluginStorage } from "../domain/manifest.js";
import type { DashboardExtension } from "../../../dashboard/extensions.js";
import type { TicketDashboardPort } from "../../../dashboard/ticketPort.js";

export interface PluginSdk {
  apiVersion: 1;
  Command: typeof Command;
  discord: typeof discord;
  z: typeof z;
  storage: PluginStorage;
  authorize(interaction: discord.RepliableInteraction, commandName: string): Promise<boolean>;
  verified(guild: discord.Guild): Promise<boolean>;
  logError(error: unknown, context: string): void;
}
export interface PluginExport {
  module: CenterifyModule;
  discord: DiscordModule;
  dashboard?: DashboardExtension;
  tickets?: TicketDashboardPort;
}
export type PluginFactory = (sdk: PluginSdk) => PluginExport | Promise<PluginExport>;
