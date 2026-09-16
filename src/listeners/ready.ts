import { Listener } from '@sapphire/framework';
import { Events, type Client } from 'discord.js';
import { restoreWarningRoleExpirations } from '../services/moderation/warningRoles.js';

export class ReadyListener extends Listener {
  public constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, { ...options, event: Events.ClientReady });
  }

  public override async run(client: Client<true>) {
    this.container.logger.info(`Logged in as ${client.user.tag}`);

    try {
      const restoredCount = await restoreWarningRoleExpirations(client);
      this.container.logger.info(
        { restoredCount },
        'Restored warning role lifecycle jobs',
      );
    } catch (error) {
      this.container.logger.error(
        { err: error },
        'Failed to restore warning role lifecycle jobs',
      );
    }
  }
}
