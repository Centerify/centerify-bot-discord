import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { definition } from "../services/customCommands/fixtures.js";
import type { CustomCommandService } from "../../src/services/customCommands/CustomCommandService.js";
import type { PrismaCustomCommandRepository } from "../../src/services/customCommands/PrismaCustomCommandRepository.js";
const url = process.env.TEST_DATABASE_URL;
const prefix = `custom-integration-${randomUUID()}`;
const guilds = [
  "a",
  "b",
  "races",
  "namespace",
  "legacy",
  "limit",
  "rollback",
  "sharing",
].map((suffix) => `${prefix}-${suffix}`);
const [a, b, races, namespace, legacy, limit, rollback, sharing] = guilds;
let db: typeof import("../../src/prisma/db.js").db;
let service: CustomCommandService, repository: PrismaCustomCommandRepository;
let sharingRepository: import("../../src/services/customCommands/PrismaCommandSharingRepository.js").PrismaCommandSharingRepository;
describe.skipIf(!url)("live custom-command PostgreSQL guarantees", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    ({ db } = await import("../../src/prisma/db.js"));
    const { PrismaCustomCommandRepository } =
      await import("../../src/services/customCommands/PrismaCustomCommandRepository.js");
    const { CustomCommandService } =
      await import("../../src/services/customCommands/CustomCommandService.js");
    repository = new PrismaCustomCommandRepository();
    service = new CustomCommandService(repository);
    const { PrismaCommandSharingRepository } =
      await import("../../src/services/customCommands/PrismaCommandSharingRepository.js");
    sharingRepository = new PrismaCommandSharingRepository();
  });
  afterAll(async () => {
    if (!db) return;
    try {
      await db.transaction(async (tx) => {
        for (const guildId of guilds) {
          await tx.orm.public.CustomCommandName.where({ guildId }).deleteAll();
          await tx.orm.public.CustomCommandRestriction.where({
            guildId,
          }).deleteAll();
          await tx.orm.public.CustomCommand.where({ guildId }).deleteAll();
          await tx.orm.public.CustomResponse.where({ guildId }).deleteAll();
        }
      });
    } finally {
      await db.close();
    }
  });
  test("CRUD, aliases and child restrictions remain isolated within and between guilds", async () => {
    const first = await service.createCommand(
      a,
      "owner",
      definition({
        aliases: ["hello"],
        allowedRoleIds: ["123456789012345678"],
      }),
    );
    await service.createCommand(
      a,
      "owner",
      definition({
        name: "second",
        aliases: ["another"],
        deniedRoleIds: ["223456789012345678"],
      }),
    );
    await service.createCommand(b, "owner-b", definition({ description: "B" }));
    expect((await service.getCommand(a, "welcome"))?.aliases).toEqual([
      "hello",
    ]);
    expect((await service.getCommand(a, "welcome"))?.deniedRoleIds).toEqual([]);
    expect((await service.getCommand(a, "second"))?.allowedRoleIds).toEqual([]);
    expect(await service.getCommandByNameOrAlias(b, "hello")).toBeNull();
    await service.updateCommand(a, "editor", "welcome", {
      description: "Edited",
      aliases: ["hi"],
    });
    expect(await service.getCommandByNameOrAlias(a, "hello")).toBeNull();
    expect((await service.getCommandByNameOrAlias(a, "hi"))?.updatedBy).toBe(
      "editor",
    );
    await service.disableCommand(a, "editor", "welcome");
    expect((await service.getCommand(a, "welcome"))?.enabled).toBe(false);
    await service.enableCommand(a, "editor", "welcome");
    await service.renameCommand(a, "editor", "welcome", "greet");
    await service.cloneCommand(a, "editor", "greet", "copy");
    expect((await service.getCommand(a, "copy"))?.aliases).toEqual([]);
    await service.deleteCommand(a, "editor", "greet");
    expect(await service.getCommandByNameOrAlias(a, "hi")).toBeNull();
    expect((await service.getCommand(b, "welcome"))?.description).toBe("B");
    expect(
      await db.orm.public.CustomCommandName.where({
        guildId: a,
        commandId: first.id,
      }).all(),
    ).toEqual([]);
  });
  test("concurrent case-insensitive name and alias claims have exactly one winner", async () => {
    const sameName = await Promise.allSettled(
      ["RULES", "rules"].map((name) =>
        service.createCommand(races, "a", definition({ name })),
      ),
    );
    expect(
      sameName.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const aliases = await Promise.allSettled(
      ["first", "second"].map((name) =>
        service.createCommand(
          namespace,
          "a",
          definition({ name, aliases: ["shared"] }),
        ),
      ),
    );
    expect(
      aliases.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    await expect(
      service.createCommand(namespace, "a", definition({ name: "shared" })),
    ).rejects.toThrow("already exists");
  });
  test("database unique/check/FK constraints enforce namespace and guild isolation", async () => {
    const command = (await service.listCommands(races))[0]!;
    await expect(
      db.orm.public.CustomCommandName.create({
        guildId: races,
        commandId: command.id,
        name: command.name,
      }),
    ).rejects.toMatchObject({ sqlState: "23505" });
    await expect(
      db.orm.public.CustomCommandName.create({
        guildId: races,
        commandId: command.id,
        name: "UPPER",
      }),
    ).rejects.toMatchObject({ sqlState: "23514" });
    await expect(
      db.orm.public.CustomCommandName.create({
        guildId: b,
        commandId: command.id,
        name: "foreign",
      }),
    ).rejects.toMatchObject({ sqlState: "23503" });
    await expect(
      db.orm.public.CustomCommandRestriction.create({
        guildId: b,
        commandId: command.id,
        kind: "allowedRoleIds",
        value: "123456789012345678",
      }),
    ).rejects.toMatchObject({ sqlState: "23503" });
  });
  test("legacy and modern systems serialize namespace claims on the same lock", async () => {
    const { customResponseService } =
      await import("../../src/services/customResponseService.js");
    const legacyInput = {
      guildId: legacy,
      name: "old",
      trigger: "shared",
      kind: "command" as const,
      response: "old",
      channelId: null,
      allowedRoleId: null,
      adminOnly: false,
      exactMatch: true,
      embed: false,
      cooldownSeconds: 0,
      createdBy: "owner",
    };
    const results = await Promise.allSettled([
      customResponseService.create(legacyInput),
      service.createCommand(
        legacy,
        "owner",
        definition({ name: "new", aliases: ["shared"] }),
      ),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
  });
  test("guild limit survives parallel creations", async () => {
    const { CustomCommandService } =
      await import("../../src/services/customCommands/CustomCommandService.js");
    const limited = new CustomCommandService(
      repository,
      undefined,
      undefined,
      1,
    );
    const results = await Promise.allSettled(
      ["first", "second"].map((name) =>
        limited.createCommand(limit, "a", definition({ name })),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(await limited.listCommands(limit)).toHaveLength(1);
  });
  test("usage counters increment atomically without changing administrative revision", async () => {
    const command = (await service.listCommands(races))[0]!;
    await Promise.all(
      Array.from({ length: 10 }, () =>
        repository.recordUsage(races, command.id),
      ),
    );
    await repository.recordUsage(b, command.id);
    service.invalidate(races);
    const updated = await service.getCommand(races, command.name);
    expect(updated?.usageCount).toBe(10);
    expect(updated?.lastUsedAt).not.toBeNull();
    expect(updated?.updatedAt).toBe(command.updatedAt);
  });
  test("failed transactions roll back saved commands, tokens and restrictions", async () => {
    await expect(
      repository.mutate(rollback, async (tx) => {
        await tx.save(
          definition({
            aliases: ["hello"],
            deniedChannelIds: ["123456789012345678"],
          }),
          "owner",
        );
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(await repository.list(rollback)).toEqual([]);
    expect(
      await db.orm.public.CustomCommandName.where({ guildId: rollback }).all(),
    ).toEqual([]);
    expect(
      await db.orm.public.CustomCommandRestriction.where({
        guildId: rollback,
      }).all(),
    ).toEqual([]);
  });
  test("exports import into another guild without copying identity or audit metadata", async () => {
    const output = await service.exportCommands(namespace);
    expect(await service.importCommands(rollback, "importer", output)).toBe(1);
    const imported = (await service.listCommands(rollback))[0]!;
    expect(imported.guildId).toBe(rollback);
    expect(imported.createdBy).toBe("importer");
    await expect(
      service.importCommands(rollback, "importer", output),
    ).rejects.toThrow("already exists");
    expect(await service.listCommands(rollback)).toHaveLength(1);
  });
  test("sharing persists a single definition, resolves aliases, clears scope and cascades on deletion", async () => {
    const command = await service.createCommand(
      sharing,
      "owner",
      definition({ name: "shared-rule", aliases: ["shared-alias"] }),
    );
    const global = {
      guildId: sharing,
      commandId: command.id,
      actorId: "owner",
      scope: "all" as const,
      selectedGuildIds: "",
    };
    await sharingRepository.save(command, global);
    expect(await sharingRepository.available(b)).toContainEqual(global);
    expect(await sharingRepository.get(sharing, command.id)).toEqual(global);
    expect(await sharingRepository.candidates("shared-alias")).toEqual([
      global,
    ]);
    const selected = {
      ...global,
      scope: "selected" as const,
      selectedGuildIds: b,
    };
    await sharingRepository.save(command, selected);
    expect(await sharingRepository.available(b)).toContainEqual(selected);
    expect(await sharingRepository.available(a)).not.toContainEqual(selected);
    expect(await sharingRepository.available(sharing)).toContainEqual(selected);
    expect(await sharingRepository.candidates("shared-rule")).toEqual([
      selected,
    ]);
    expect(await repository.list(sharing)).toHaveLength(1);
    expect(await repository.list(b)).not.toContainEqual(
      expect.objectContaining({ name: "shared-rule" }),
    );
    await expect(
      db.orm.public.CustomCommandSharing.create({
        ...global,
        commandId: command.id + 100000,
        guildId: b,
      }),
    ).rejects.toMatchObject({ sqlState: "23503" });
    await sharingRepository.save(command, null);
    expect(await sharingRepository.candidates("shared-rule")).toEqual([]);
    await sharingRepository.save(command, global);
    await service.deleteCommand(sharing, "owner", command.name);
    expect(await sharingRepository.get(sharing, command.id)).toBeNull();
  });
  test("scope saves reject stale definitions and server-specific restrictions", async () => {
    const command = await service.createCommand(
      sharing,
      "owner",
      definition({ name: "changing-rule" }),
    );
    const global = {
      guildId: sharing,
      commandId: command.id,
      actorId: "owner",
      scope: "all" as const,
      selectedGuildIds: "",
    };
    await service.updateCommand(sharing, "owner", command.name, {
      description: "Edited after opening",
    });
    await expect(sharingRepository.save(command, global)).rejects.toThrow(
      "changed",
    );
    const restricted = await service.updateCommand(
      sharing,
      "owner",
      command.name,
      { deniedRoleIds: ["123456789012345678"] },
    );
    await expect(sharingRepository.save(restricted, global)).rejects.toThrow(
      "server-specific",
    );
    expect(await sharingRepository.get(sharing, command.id)).toBeNull();
  });
});
