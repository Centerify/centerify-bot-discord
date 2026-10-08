import 'dotenv/config';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from '../../prisma/contract.d';
import contractJson from '../../prisma/contract.json' with { type: 'json' };

export function createDatabase(url: string | undefined = process.env['DATABASE_URL']) {
  return postgres<Contract>({ contractJson, url });
}
export const db = createDatabase();
