import { VerifiedGuildOwnershipPrecondition } from "./verifiedGuildOwnership.js";
import { CommandRoleAccessPrecondition } from "./commandRoleAccess.js";
export { VerifiedGuildOwnershipPrecondition } from "./verifiedGuildOwnership.js";
import type { DiscordModule } from "../../../adapters/discord/modules.js";
import { UnverifyCommand } from "./commands/unverify.js";
import { VerifyCommand } from "./commands/verify.js";
export { UnverifyCommand } from "./commands/unverify.js";
export { VerifyCommand } from "./commands/verify.js";
export * from "./config.js";
export * from "./ownership.js";
export * from "./permissions.js";

export const discordModule: DiscordModule = {
  preconditions: {
    verifiedGuildOwnership: VerifiedGuildOwnershipPrecondition,
    commandRoleAccess: CommandRoleAccessPrecondition,
  },
  commands: { unverify: UnverifyCommand, verify: VerifyCommand },
};
