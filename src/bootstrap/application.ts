import { container } from "@sapphire/framework";
import { InMemoryEventBus, ModuleRegistry, loggerToken, eventsToken, type CenterifyModule, type Logger, type ModuleConfiguration } from "../core/index.js";
import { withDiscord } from "../adapters/discord/modules.js";
import { createGuildsModule, type GuildConfigStore, type OwnershipRepository } from "../modules/guilds/index.js";
import { createModerationModule, type ModerationCaseRepository, type ReportRepository } from "../modules/moderation/index.js";
import { createCustomCommandsModule, type CustomCommandRepository, type LegacyResponseRepository, type SharingRepository } from "../modules/custom-commands/index.js";
import { createXpModule, type XpRepository, type XpConfigurationRepository } from "../modules/xp/index.js";
import { createWelcomeModule } from "../modules/welcome/index.js";
import { createSettingsModule } from "../modules/settings/index.js";
import { createInformationModule, type RepositoryInfoProvider } from "../modules/information/index.js";
import { PrismaGuildConfigRepository } from "../modules/guilds/infrastructure/PrismaGuildConfigRepository.js";
import { PrismaOwnershipRepository } from "../modules/guilds/infrastructure/PrismaOwnershipRepository.js";
import { PrismaModerationCaseRepository } from "../modules/moderation/infrastructure/PrismaModerationCaseRepository.js";
import { PrismaReportRepository } from "../modules/moderation/infrastructure/PrismaReportRepository.js";
import { PrismaCustomCommandRepository } from "../modules/custom-commands/infrastructure/PrismaCustomCommandRepository.js";
import { PrismaCommandSharingRepository } from "../modules/custom-commands/infrastructure/PrismaCommandSharingRepository.js";
import { PrismaLegacyResponseRepository } from "../modules/custom-commands/infrastructure/PrismaLegacyResponseRepository.js";
import { PrismaXpRepository } from "../modules/xp/infrastructure/PrismaXpRepository.js";
import { PrismaXpConfigurationRepository } from "../modules/xp/infrastructure/PrismaXpConfigurationRepository.js";
import { getRepositoryInfo } from "../modules/information/infrastructure/repositoryInfo.js";
import { db } from "../adapters/prisma/client.js";
import { logger } from "../adapters/logging/pino.js";

export interface ApplicationOptions {
  modules?: ModuleConfiguration;
  logger?: Logger;
  database?: typeof db;
  repositories?: Partial<{
    guilds: GuildConfigStore; ownership: OwnershipRepository; moderation: ModerationCaseRepository;
    reports: ReportRepository; commands: CustomCommandRepository; sharing: SharingRepository;
    legacy: LegacyResponseRepository; xp: XpRepository; xpConfiguration: XpConfigurationRepository;
    information: RepositoryInfoProvider;
  }>;
  /** Replace a built-in by ID, or append a separately packaged module. */
  replacements?: readonly CenterifyModule[];
  additionalModules?: readonly CenterifyModule[];
}

export function createApplication(options: ApplicationOptions = {}) {
  const application = new ModuleRegistry();
  const database = options.database ?? db;
  const repositories = options.repositories ?? {};
  const log = options.logger ?? logger;
  const builtins: CenterifyModule[] = [
    { metadata: { id: "runtime", name: "Application resources", version: "1.0.0" }, register(context) {
      context.provide(loggerToken, log);
      context.provide(eventsToken, new InMemoryEventBus());
    } },
    withDiscord(createGuildsModule({ config: repositories.guilds ?? new PrismaGuildConfigRepository(database), ownership: repositories.ownership ?? new PrismaOwnershipRepository(database) }), async () => (await import("../modules/guilds/discord/index.js")).discordModule),
    withDiscord(createModerationModule({ logger: log, repository: repositories.moderation ?? new PrismaModerationCaseRepository(database), reports: repositories.reports ?? new PrismaReportRepository(database) }), async () => (await import("../modules/moderation/discord/index.js")).discordModule),
    withDiscord(createXpModule({ repository: repositories.xp ?? new PrismaXpRepository(database), configuration: repositories.xpConfiguration ?? new PrismaXpConfigurationRepository(database) }), async () => (await import("../modules/xp/discord/index.js")).discordModule),
    withDiscord(createWelcomeModule(), async () => (await import("../modules/welcome/discord/index.js")).discordModule),
    withDiscord(createCustomCommandsModule({ repository: repositories.commands ?? new PrismaCustomCommandRepository(database), legacy: repositories.legacy ?? new PrismaLegacyResponseRepository(database), sharing: repositories.sharing ?? new PrismaCommandSharingRepository(database), logger: log,
      reservedNames: () => [...(container.stores?.get("commands")?.keys() ?? [])],
      validateReferences: async (guildId, definitions) => {
        const { validateGuildReferences } = await import("../modules/custom-commands/discord/index.js");
        await validateGuildReferences(await container.client.guilds.fetch(guildId), definitions);
      },
    }), async () => (await import("../modules/custom-commands/discord/index.js")).discordModule),
    withDiscord(createSettingsModule(), async () => (await import("../modules/settings/discord/index.js")).discordModule),
    withDiscord(createInformationModule(repositories.information ?? { get: getRepositoryInfo }), async () => (await import("../modules/information/discord/index.js")).discordModule),
  ];
  const replacements = new Map<string, CenterifyModule>();
  for (const module of options.replacements ?? []) {
    if (replacements.has(module.metadata.id)) throw new Error(`Duplicate replacement module: ${module.metadata.id}`);
    replacements.set(module.metadata.id, module);
  }
  for (const module of builtins) {
    application.register(replacements.get(module.metadata.id) ?? module, options.modules?.[module.metadata.id]);
    replacements.delete(module.metadata.id);
  }
  if (replacements.size) throw new Error(`Cannot replace unknown modules: ${[...replacements.keys()].join(", ")}`);
  for (const module of options.additionalModules ?? []) application.register(module, options.modules?.[module.metadata.id]);
  const ids = new Set(application.list().map((module) => module.id));
  for (const id of Object.keys(options.modules ?? {})) if (!ids.has(id)) throw new Error(`Unknown configured module: ${id}`);
  return application;
}
