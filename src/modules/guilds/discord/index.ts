import { VerifiedGuildOwnershipPrecondition } from "./verifiedGuildOwnership.js";
export { VerifiedGuildOwnershipPrecondition } from "./verifiedGuildOwnership.js";
import { discordEvent, type DiscordModule } from "../../../adapters/discord/modules.js";
import { UnverifyCommand } from "./commands/unverify.js";
import { VerifyCommand } from "./commands/verify.js";
export { UnverifyCommand } from "./commands/unverify.js";
export { VerifyCommand } from "./commands/verify.js";
export * from "./config.js";
export * from "./ownership.js";
export * from "./permissions.js";

export const discordModule: DiscordModule = {
  preconditions: { verifiedGuildOwnership: VerifiedGuildOwnershipPrecondition },
  commands: { "unverify": UnverifyCommand, "verify": VerifyCommand },
};
