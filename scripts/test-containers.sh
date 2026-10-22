#!/bin/sh
set -eu

# Always use a unique disposable project; never select the operator's deployment.
project="centerify-smoke-${GITHUB_RUN_ID:-local}-$$"
export DISCORD_TOKEN=container-test-no-login
export POSTGRES_PASSWORD=container-test-admin
export CENTERIFY_DB_PASSWORD=container-test-app
export CENTERIFY_IMAGE_TAG="$project"

compose() {
  docker compose --env-file .env.compose.example --project-name "$project" "$@"
}
cleanup() {
  compose logs --no-color || true
  compose down --volumes --remove-orphans
}
trap cleanup EXIT

compose config --quiet
compose build bot migrate plugins
compose up --detach --wait --wait-timeout 120 postgres
compose run --rm migrate
# Applying the same graph twice must be safe.
compose run --rm migrate
compose run --rm --no-deps plugins install better-ticket
compose run --rm --no-deps plugins verify better-ticket

compose run --rm --no-deps -T --entrypoint node bot --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { db } from './dist/src/adapters/prisma/client.js';
import { startHealthServer } from './dist/src/bootstrap/health.js';
import { defaultPluginManager, loadInstalledPlugins } from './dist/src/bootstrap/plugins.js';

assert.notEqual(process.getuid(), 0, 'runtime must be non-root');
await assert.rejects(access('node_modules/prisma'));
await assert.rejects(access('node_modules/typescript'));
await assert.rejects(writeFile('/app/should-be-read-only', 'no'));
await assert.rejects(writeFile('/app/plugins/installed/should-be-read-only', 'no'));
await writeFile('/app/.centerify/container-smoke', 'persistent');
const plugins = await loadInstalledPlugins(defaultPluginManager());
assert(plugins.some(plugin => plugin.metadata.id === 'better-ticket'));

let connected = true;
const health = await startHealthServer(3000, async () => {
  if (!connected) return false;
  await db.orm.public.GuildConfig.first();
  return true;
});
try {
  const exec = promisify(execFile);
  await exec(process.execPath, ['scripts/healthcheck.mjs']);
  connected = false;
  await assert.rejects(exec(process.execPath, ['scripts/healthcheck.mjs']));
  connected = true;
  await exec(process.execPath, ['scripts/healthcheck.mjs']);
  assert.equal(await readFile('/app/.centerify/container-smoke', 'utf8'), 'persistent');
} finally {
  await health.close();
  await db.close();
}
JS

# A new container must see the same plugin state and package volumes.
compose run --rm --no-deps -T --entrypoint node bot --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
assert.equal(await readFile('/app/.centerify/container-smoke', 'utf8'), 'persistent');
JS

# Exercise PostgreSQL dump/restore using the same non-superuser application role.
compose exec -T postgres pg_dump -U postgres -d centerify -Fc -f /tmp/centerify.dump
compose exec -T postgres createdb -U postgres -O centerify centerify_restore
compose exec -T postgres pg_restore -U centerify -d centerify_restore --no-owner --exit-on-error /tmp/centerify.dump
compose exec -T postgres psql -U centerify -d centerify_restore -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM public.guild_config;'
