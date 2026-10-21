#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/01e9ce03a292435e66750ed685c656abd341f28a91aa637b01713841ab2926fb/contract';
import endContract from '../../snapshots/01e9ce03a292435e66750ed685c656abd341f28a91aa637b01713841ab2926fb/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/4721d6a27f9cb5f869c7bf9e84f11d9a744d8fb3ab8e1cdbc9108207b0e78d13/contract';
import startContract from '../../snapshots/4721d6a27f9cb5f869c7bf9e84f11d9a744d8fb3ab8e1cdbc9108207b0e78d13/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'guild_config',
        column: col('ticketSettings', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
