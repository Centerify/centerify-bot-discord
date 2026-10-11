#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/4721d6a27f9cb5f869c7bf9e84f11d9a744d8fb3ab8e1cdbc9108207b0e78d13/contract';
import endContract from '../../snapshots/4721d6a27f9cb5f869c7bf9e84f11d9a744d8fb3ab8e1cdbc9108207b0e78d13/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/8f45d6d1cc46b2fe3738fc8990f468c978137894031c5a92132729734c689b05/contract';
import startContract from '../../snapshots/8f45d6d1cc46b2fe3738fc8990f468c978137894031c5a92132729734c689b05/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'guild_config',
        column: col('commandRoleAccess', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'guild_config',
        column: col('warningRoleSettings', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
