import { Listener } from '@sapphire/framework';
import { Events, type Client } from 'discord.js';

export class ReadyListener extends Listener {
  public constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, { ...options, event: Events.ClientReady });
  }

  public override run(client: Client<true>) {
    this.container.logger.info(`Logged in as ${client.user.tag}`);
  }
}
