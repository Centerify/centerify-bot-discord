import { serviceToken } from "../../../core/index.js";
import type { CustomCommandExecutor } from "./CustomCommandExecutor.js";
import type { CustomCommandSharingService } from "./CustomCommandSharingService.js";
export const executorToken = serviceToken<Pick<CustomCommandExecutor, keyof CustomCommandExecutor>>("custom-commands.discord.executor");
export const sharingToken = serviceToken<Pick<CustomCommandSharingService, keyof CustomCommandSharingService>>("custom-commands.discord.sharing");
