import { Listener } from '@sapphire/framework';
import type { Client } from 'discord.js';

export class ReadyListener extends Listener {
  public override run(client: Client<true>) {
    this.container.logger.info(`Logged in as ${client.user.tag}`);
  }
}
