import { discordEvent, type DiscordModule } from "../../../adapters/discord/modules.js";

export * from "./greeting.js";
export { formatGreetingVariableList, renderGreetingTemplate } from "./variables.js";
import { GreetingService, greetingAdapterToken } from "./greeting.js";
import { greetingPlanToken } from "../index.js";
import { GuildMemberAddListener } from "./guildMemberAdd.js";
import { GuildMemberRemoveListener } from "./guildMemberRemove.js";

export const discordModule: DiscordModule = {
  commands: {  },
  register(context) { context.provide(greetingAdapterToken, new GreetingService(context.resolve(greetingPlanToken))); },
  events: [
    discordEvent("guildMemberAdd", (member) => new GuildMemberAddListener().run(member)),
    discordEvent("guildMemberRemove", (member) => new GuildMemberRemoveListener().run(member)),
  ],
};
