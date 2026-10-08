import { serviceRef } from "../../../adapters/discord/context.js";
import { repositoryInfoToken } from "../index.js";
export function getRepositoryInfo() { return serviceRef(repositoryInfoToken).get(); }
