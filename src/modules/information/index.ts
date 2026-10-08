import { serviceToken, type CenterifyModule } from "../../core/index.js";
import type { RepositoryInfo } from "./domain/RepositoryInfo.js";
export type { RepositoryInfo } from "./domain/RepositoryInfo.js";
export interface RepositoryInfoProvider { get(): Promise<RepositoryInfo> }
export const repositoryInfoToken = serviceToken<RepositoryInfoProvider>("information.repository");
export function createInformationModule(repository: RepositoryInfoProvider): CenterifyModule {
  return {
    metadata: { id: "information", name: "Information", version: "1.0.0", dependsOn: ["guilds"] },
    register(context) { context.provide(repositoryInfoToken, repository); },
  };
}
