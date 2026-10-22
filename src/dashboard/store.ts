import { db } from "../adapters/prisma/client.js";
import { DashboardError, type LiveEvent } from "./contracts.js";
import { fingerprint, recoveryEvents } from "./security.js";
import { z } from "zod";
const json = (value: unknown) => z.json().parse(JSON.parse(JSON.stringify(value ?? null)));

/** PostgreSQL is shared by all web replicas. The gateway remains a single owner. */
export class DashboardStore {
  constructor(readonly database = db) {}
  async account(id: string, name?: string, theme?: string) {
    if (name !== undefined)
      return this.database.orm.public.DashboardAccount.upsert({
        create: { id, name },
        update: { name },
        conflictOn: { id },
      });
    if (theme) await this.database.orm.public.DashboardAccount.where({ id }).update({ theme });
    return this.database.orm.public.DashboardAccount.where({ id }).first();
  }
  async emit(
    guildId: string,
    type: string,
    summary: string,
    actorId: string | null = null,
    data: unknown = null,
  ) {
    return this.database.orm.public.DashboardEvent.create({
      guildId,
      type,
      summary: summary.slice(0, 240),
      actorId,
      data: json(data),
    });
  }
  async events(guildId: string, cursor: number) {
    const oldest = await this.database.orm.public.DashboardEvent.where({ guildId })
      .orderBy((e) => e.id.asc())
      .first();
    const events = await this.database.orm.public.DashboardEvent.where({ guildId })
      .where((e) => e.id.gt(cursor))
      .orderBy((e) => e.id.asc())
      .limit(100)
      .all();
    return recoveryEvents(events as LiveEvent[], cursor, oldest?.id);
  }
  async recent(guildId: string, limit = 30) {
    return this.database.orm.public.DashboardEvent.where({ guildId })
      .orderBy((e) => e.id.desc())
      .limit(limit)
      .all();
  }
  async once<T>(
    guildId: string,
    actorId: string,
    key: string,
    input: unknown,
    run: () => Promise<T>,
  ): Promise<T> {
    if (!/^[a-f0-9-]{36}$/.test(key))
      throw new DashboardError(400, "A UUID idempotency key is required");
    const digest = fingerprint(input);
    const operation =
      input && typeof input === "object" && "resource" in input
        ? String(input.resource)
        : input && typeof input === "object" && "workflow" in input
          ? `workflow:${String(input.workflow)}`
          : "dashboard.operation";
    const operationKey = `${guildId}:${actorId}:${key}`;
    try {
      await this.database.orm.public.DashboardOperation.create({
        key: operationKey,
        guildId,
        actorId,
        fingerprint: digest,
      });
    } catch (error) {
      const old = await this.database.orm.public.DashboardOperation.where({
        key: operationKey,
      }).first();
      if (!old) throw error;
      if (old.fingerprint !== digest)
        throw new DashboardError(409, "This operation key was used for different data");
      if (old.status !== "succeeded")
        throw new DashboardError(
          409,
          "This operation was already attempted. Check the audit log before taking another action.",
        );
      return old.result as T;
    }
    await this.emit(guildId, "audit.started", `${operation} started`, actorId, {
      operationId: key,
      operation,
    });
    try {
      const result = await run();
      await this.database.orm.public.DashboardOperation.where({ key: operationKey }).update({
        status: "succeeded",
        result: json(result),
      });
      await this.emit(guildId, "audit.succeeded", `${operation} completed`, actorId, {
        operationId: key,
        operation,
      });
      return result;
    } catch (error) {
      // Effects may have reached Discord: never automatically retry an uncertain operation.
      await this.database.orm.public.DashboardOperation.where({ key: operationKey }).update({
        status: "uncertain",
      });
      await this.emit(
        guildId,
        "audit.failed",
        "Dashboard operation failed or needs reconciliation",
        actorId,
        { operationId: key, operation },
      );
      throw error;
    }
  }
  workflows(guildId: string) {
    return this.database.orm.public.DashboardWorkflow.where({ guildId })
      .orderBy((w) => w.name.asc())
      .limit(100)
      .all();
  }
  workflow(guildId: string, name: string) {
    return this.database.orm.public.DashboardWorkflow.where({ guildId, name }).first();
  }
  async saveWorkflow(
    guildId: string,
    actorId: string,
    name: string,
    draft: unknown,
    revision: number,
    published?: unknown,
    enabled?: boolean,
  ) {
    const current = await this.workflow(guildId, name);
    if (!current) {
      if (revision !== 0)
        throw new DashboardError(409, "Workflow was removed. Refresh before saving.");
      return this.database.orm.public.DashboardWorkflow.create({
        guildId,
        name,
        draft: json(draft),
        history: [],
        updatedBy: actorId,
        published: json(published),
        enabled: enabled ?? false,
      });
    }
    if (current.revision !== revision)
      throw new DashboardError(409, "Workflow changed elsewhere. Reload before saving.");
    const history = Array.isArray(current.history) ? current.history : [];
    const result = await this.database.orm.public.DashboardWorkflow.where({
      guildId,
      name,
      revision,
    }).update({
      draft: json(draft),
      updatedBy: actorId,
      revision: revision + 1,
      ...(enabled !== undefined ? { enabled } : {}),
      ...(published !== undefined
        ? {
            published: json(published),
            history: json([
              ...history.slice(-29),
              {
                revision,
                definition: current.published ?? current.draft,
                at: new Date().toISOString(),
                actorId,
              },
            ]),
          }
        : {}),
    });
    if (!result) throw new DashboardError(409, "Workflow changed elsewhere. Reload before saving.");
    return result;
  }
  plugins(guildId: string) {
    return this.database.orm.public.DashboardPlugin.where({ guildId }).all();
  }
  async setPlugin(
    guildId: string,
    pluginId: string,
    enabled: boolean,
    config: unknown,
    revision: number,
  ) {
    const current = await this.database.orm.public.DashboardPlugin.where({
      guildId,
      pluginId,
    }).first();
    if (!current) {
      if (revision !== 0) throw new DashboardError(409, "Plugin activation changed");
      return this.database.orm.public.DashboardPlugin.create({
        guildId,
        pluginId,
        enabled,
        config: json(config),
      });
    }
    const changed = await this.database.orm.public.DashboardPlugin.where({
      guildId,
      pluginId,
      revision,
    }).update({ enabled, config: json(config), revision: revision + 1 });
    if (!changed) throw new DashboardError(409, "Plugin activation changed elsewhere");
    return changed;
  }
}
