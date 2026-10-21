import { discordEvent, type DiscordModule } from "../../../adapters/discord/modules.js";
import { TicketCommand } from "./commands/ticket.js";
import { OPEN_TICKET_BUTTON, runTicket } from "./runtime.js";

export { TicketCommand };
export const discordModule: DiscordModule = {
  commands: { ticket: TicketCommand },
  events: [
    discordEvent("interactionCreate", async (interaction) => {
      if (interaction.isButton() && interaction.customId === OPEN_TICKET_BUTTON)
        await runTicket(interaction);
    }),
  ],
};
