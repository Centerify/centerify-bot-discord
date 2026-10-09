import { serviceToken } from "../../../core/index.js";
import type { CustomCommandExecutionPort } from "./types.js";
import type { CustomCommandSharingService } from "./CustomCommandSharingService.js";
export const executorToken = serviceToken<CustomCommandExecutionPort>("custom-commands.discord.executor");
export const sharingToken = serviceToken<Pick<CustomCommandSharingService, keyof CustomCommandSharingService>>("custom-commands.discord.sharing");
