import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { DashboardStore } from "../../src/dashboard/store.js";
import { createDatabase } from "../../src/adapters/prisma/client.js";
import { PrismaGuildConfigRepository } from "../../src/modules/guilds/infrastructure/PrismaGuildConfigRepository.js";
const url = process.env.TEST_DATABASE_URL,
  guild = `dashboard-integration-${randomUUID()}`,
  other = `${guild}-other`;
let database: ReturnType<typeof createDatabase>, store: DashboardStore;
describe.skipIf(!url)("dashboard PostgreSQL guarantees", () => {
  beforeAll(() => {
    database = createDatabase(url);
    store = new DashboardStore(database);
  });
  afterAll(async () => {
    if (!database) return;
    for (const id of [guild, other]) {
      await database.orm.public.DashboardOperation.where({ guildId: id }).deleteAll();
      await database.orm.public.DashboardEvent.where({ guildId: id }).deleteAll();
      await database.orm.public.DashboardWorkflow.where({ guildId: id }).deleteAll();
      await database.orm.public.DashboardPlugin.where({ guildId: id }).deleteAll();
      await database.orm.public.GuildConfig.where({ guildId: id }).deleteAll();
    }
    await database.close();
  });
  test("concurrent duplicate sensitive requests execute once and replay the result", async () => {
    const key = randomUUID(),
      run = vi.fn(async () => ({ applied: true }));
    const results = await Promise.allSettled([
      store.once(guild, "actor", key, { action: "ban" }, run),
      store.once(guild, "actor", key, { action: "ban" }, run),
    ]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    await expect(store.once(guild, "actor", key, { action: "ban" }, run)).resolves.toEqual({
      applied: true,
    });
    await expect(store.once(guild, "actor", key, { action: "kick" }, run)).rejects.toMatchObject({
      status: 409,
    });
  });
  test("uncertain effects cannot execute again with the same operation key", async () => {
    const key = randomUUID(),
      run = vi.fn(async () => {
        throw new Error("Result lost after Discord effect");
      });
    await expect(store.once(guild, "actor", key, { action: "timeout" }, run)).rejects.toThrow();
    await expect(store.once(guild, "actor", key, { action: "timeout" }, run)).rejects.toMatchObject(
      { status: 409 },
    );
    expect(run).toHaveBeenCalledTimes(1);
  });
  test("atomic setting revisions reject stale writes", async () => {
    const repo = new PrismaGuildConfigRepository(database),
      initial = await repo.getOrCreate(guild);
    const [a, b] = await Promise.all([
      repo.updateIfCurrent(guild, { welcomeEnabled: true }, initial.updatedAt),
      repo.updateIfCurrent(guild, { loggingEnabled: true }, initial.updatedAt),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const saved = a ?? b;
    expect(Date.parse(saved!.updatedAt)).toBeGreaterThan(Date.parse(initial.updatedAt));
    await expect(
      repo.updateIfCurrent(guild, { welcomeEnabled: false }, initial.updatedAt),
    ).resolves.toBeNull();
  });
  test("simultaneous workflow revisions permit only one writer", async () => {
    const first = await store.saveWorkflow(guild, "actor", "concurrent", { version: 1 }, 0);
    const results = await Promise.allSettled([
      store.saveWorkflow(guild, "actor", "concurrent", { writer: "a" }, first.revision),
      store.saveWorkflow(guild, "actor", "concurrent", { writer: "b" }, first.revision),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
  });
  test("simultaneous plugin revisions permit only one writer", async () => {
    const first = await store.setPlugin(guild, "example", false, {}, 0);
    const results = await Promise.allSettled([
      store.setPlugin(guild, "example", true, { writer: "a" }, first.revision),
      store.setPlugin(guild, "example", true, { writer: "b" }, first.revision),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
  });
  test("events and workflows stay within their guild and use atomic revisions", async () => {
    await store.emit(guild, "test.created", "Local event");
    await store.emit(other, "test.created", "Other event");
    expect((await store.events(guild, 0)).events.every((e) => e.guildId === guild)).toBe(true);
    const first = await store.saveWorkflow(guild, "actor", "hello", { version: 1 }, 0);
    await expect(store.workflow(other, "hello")).resolves.toBeNull();
    await store.saveWorkflow(guild, "actor", "hello", { version: 1, nodes: [] }, first.revision);
    await expect(
      store.saveWorkflow(guild, "actor", "hello", {}, first.revision),
    ).rejects.toMatchObject({ status: 409 });
  });
});
