import { beforeEach, describe, expect, test, vi } from "vitest";
vi.mock("../../../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));
import { CustomCommandService } from "../../../src/services/customCommands/CustomCommandService.js";
import { definition, MemoryRepository } from "./fixtures.js";
let repo: MemoryRepository, service: CustomCommandService;
beforeEach(() => {
  repo = new MemoryRepository();
  service = new CustomCommandService(repo);
});

describe("CRUD and guild isolation", () => {
  test("create, read, update, enable, disable, rename, clone and delete preserve audit data", async () => {
    const created = await service.createCommand(
      "guild-a",
      "creator",
      definition(),
    );
    expect(created.createdBy).toBe("creator");
    expect(created.updatedBy).toBe("creator");
    expect(await service.getCommand("guild-a", " Welcome ")).toEqual(created);
    const updated = await service.updateCommand(
      "guild-a",
      "editor",
      "welcome",
      { description: "Updated", aliases: ["hi"] },
    );
    expect(updated.updatedBy).toBe("editor");
    expect(updated.createdBy).toBe("creator");
    expect(updated.updatedAt).not.toBe(created.updatedAt);
    expect((await service.getCommandByNameOrAlias("guild-a", "HI"))?.id).toBe(
      created.id,
    );
    expect(await service.getCommand("guild-a", "hi")).toBeNull();
    expect(
      (await service.disableCommand("guild-a", "editor", "welcome")).enabled,
    ).toBe(false);
    expect(
      (await service.enableCommand("guild-a", "editor", "welcome")).enabled,
    ).toBe(true);
    await service.renameCommand("guild-a", "editor", "welcome", "greeting");
    expect(await service.getCommand("guild-a", "welcome")).toBeNull();
    const cloned = await service.cloneCommand(
      "guild-a",
      "cloner",
      "greeting",
      "salute",
    );
    expect(cloned.aliases).toEqual([]);
    expect(cloned.id).not.toBe(created.id);
    expect(cloned.usageCount).toBe(0);
    expect(cloned.createdBy).toBe("cloner");
    await service.deleteCommand("guild-a", "editor", "greeting");
    expect(await service.getCommandByNameOrAlias("guild-a", "hi")).toBeNull();
    expect(await service.listCommands("guild-a")).toHaveLength(1);
  });
  test("Guild A names, aliases, writes and exports are inaccessible from Guild B", async () => {
    await service.createCommand(
      "guild-a",
      "a",
      definition({ aliases: ["hello"] }),
    );
    expect(await service.getCommand("guild-b", "welcome")).toBeNull();
    expect(
      await service.getCommandByNameOrAlias("guild-b", "hello"),
    ).toBeNull();
    await expect(
      service.updateCommand("guild-b", "b", "welcome", { enabled: false }),
    ).rejects.toThrow("No custom command");
    await expect(
      service.deleteCommand("guild-b", "b", "welcome"),
    ).rejects.toThrow("No custom command");
    expect(
      JSON.parse(await service.exportCommands("guild-b")).commands,
    ).toEqual([]);
    await service.createCommand(
      "guild-b",
      "b",
      definition({ description: "B" }),
    );
    await service.deleteCommand("guild-a", "a", "welcome");
    expect((await service.getCommand("guild-b", "welcome"))?.description).toBe(
      "B",
    );
  });
  test("cannot modify another guild's cached objects through returned references", async () => {
    await service.createCommand("guild-a", "a", definition());
    const found = (await service.listCommands("guild-a"))[0]!;
    found.aliases.push("injected");
    found.content[0] = { type: "TEXT", text: "Changed" };
    expect(
      await service.getCommandByNameOrAlias("guild-a", "injected"),
    ).toBeNull();
    expect((await service.getCommand("guild-a", "welcome"))?.content).toEqual(
      definition().content,
    );
  });
  test("rejects a repository response that violates guild isolation", async () => {
    repo.list.mockResolvedValueOnce([
      {
        ...(await service.createCommand("guild-a", "a", definition())),
        guildId: "guild-b",
      },
    ]);
    await expect(service.listCommands("guild-a")).rejects.toThrow(
      "guild isolation",
    );
  });
});

describe("namespace, concurrency and cache", () => {
  test("normalizes without transliterating Unicode; detects name and alias conflicts", async () => {
    const command = await service.createCommand(
      "guild-a",
      "a",
      definition({ name: "  RÜLES  ", aliases: [" قانون "] }),
    );
    expect(command.name).toBe("rüles");
    expect(command.aliases).toEqual(["قانون"]);
    await expect(
      service.createCommand("guild-a", "a", definition({ name: "rüles" })),
    ).rejects.toThrow("already exists");
    await expect(
      service.createCommand("guild-a", "a", definition({ aliases: ["قانون"] })),
    ).rejects.toThrow("already exists");
    await expect(
      service.createCommand("guild-a", "a", definition({ name: "قانون" })),
    ).rejects.toThrow("already exists");
  });
  test("built-in registry names and aliases are protected on create, edit, clone and import", async () => {
    service = new CustomCommandService(repo, undefined, () => [
      "ping",
      "latency",
    ]);
    for (const name of ["ban", "custom", "ping", "latency"])
      await expect(
        service.createCommand("guild-a", "a", definition({ name })),
      ).rejects.toThrow("reserved");
    await service.createCommand("guild-a", "a", definition());
    await expect(
      service.renameCommand("guild-a", "a", "welcome", "HELP"),
    ).rejects.toThrow("reserved");
    await expect(
      service.cloneCommand("guild-a", "a", "welcome", "setup"),
    ).rejects.toThrow("reserved");
    await expect(
      service.updateCommand("guild-a", "a", "welcome", { aliases: ["warn"] }),
    ).rejects.toThrow("reserved");
    await expect(
      service.importCommands(
        "guild-a",
        "a",
        JSON.stringify({
          version: 1,
          commands: [definition({ name: "kick" })],
        }),
      ),
    ).rejects.toThrow("reserved");
  });
  test("a newly registered built-in suppresses an old custom command at lookup", async () => {
    let reserved: string[] = [];
    service = new CustomCommandService(repo, undefined, () => reserved);
    await service.createCommand("guild-a", "a", definition());
    reserved = ["welcome"];
    expect(
      await service.getCommandByNameOrAlias("guild-a", "welcome"),
    ).toBeNull();
  });
  test("legacy names and triggers cannot be claimed", async () => {
    repo.legacy["guild-a"] = ["legacy", "old-trigger"];
    await expect(
      service.createCommand(
        "guild-a",
        "a",
        definition({ aliases: ["old-trigger"] }),
      ),
    ).rejects.toThrow("already exists");
  });
  test("simultaneous creations and alias claims have exactly one winner", async () => {
    const results = await Promise.allSettled([
      service.createCommand(
        "guild-a",
        "a",
        definition({ name: "first", aliases: ["shared"] }),
      ),
      service.createCommand(
        "guild-a",
        "b",
        definition({ name: "second", aliases: ["shared"] }),
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(repo.records).toHaveLength(1);
  });
  test("limit is scoped by guild and enforced for clone/import and concurrent create", async () => {
    service = new CustomCommandService(repo, undefined, undefined, 1);
    await service.createCommand("guild-a", "a", definition());
    await service.createCommand("guild-b", "b", definition());
    await expect(
      service.cloneCommand("guild-a", "a", "welcome", "copy"),
    ).rejects.toThrow("at most 1");
    await expect(
      service.importCommands(
        "guild-a",
        "a",
        JSON.stringify({ version: 1, commands: [definition({ name: "new" })] }),
      ),
    ).rejects.toThrow("at most 1");
    const results = await Promise.allSettled(
      ["first", "second"].map((name) =>
        service.createCommand("guild-c", "a", definition({ name })),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  test("lookups are cached; create, update, rename, disable and delete invalidate immediately", async () => {
    await service.createCommand(
      "guild-a",
      "a",
      definition({ aliases: ["hello"] }),
    );
    await service.getCommandByNameOrAlias("guild-a", "hello");
    await service.getCommandByNameOrAlias("guild-a", "welcome");
    expect(repo.list).toHaveBeenCalledTimes(1);
    await service.updateCommand("guild-a", "a", "welcome", { aliases: ["hi"] });
    expect(
      await service.getCommandByNameOrAlias("guild-a", "hello"),
    ).toBeNull();
    expect(
      await service.getCommandByNameOrAlias("guild-a", "hi"),
    ).not.toBeNull();
    await service.disableCommand("guild-a", "a", "welcome");
    expect((await service.getCommand("guild-a", "welcome"))?.enabled).toBe(
      false,
    );
    await service.renameCommand("guild-a", "a", "welcome", "greeting");
    expect(await service.getCommand("guild-a", "welcome")).toBeNull();
    await service.deleteCommand("guild-a", "a", "greeting");
    expect(await service.getCommandByNameOrAlias("guild-a", "hi")).toBeNull();
    expect(repo.list).toHaveBeenCalledTimes(5);
  });
  test("optimistic editor concurrency rejects stale saves", async () => {
    const created = await service.createCommand("guild-a", "a", definition());
    await service.updateCommand("guild-a", "b", "welcome", {
      description: "Newer",
    });
    await expect(
      service.updateCommand(
        "guild-a",
        "a",
        "welcome",
        { description: "Stale" },
        "updated",
        created.updatedAt,
      ),
    ).rejects.toThrow("changed while");
    expect((await service.getCommand("guild-a", "welcome"))?.description).toBe(
      "Newer",
    );
  });
});

describe("portable validated import/export", () => {
  test("valid roundtrip reassigns guild, IDs, creator and statistics", async () => {
    await service.createCommand(
      "guild-a",
      "a",
      definition({ aliases: ["hi"] }),
    );
    const exported = await service.exportCommands("guild-a");
    const data = JSON.parse(exported);
    expect(data.version).toBe(1);
    expect(data.commands[0].guildId).toBeUndefined();
    expect(data.commands[0].usageCount).toBeUndefined();
    expect(await service.importCommands("guild-b", "b", exported)).toBe(1);
    expect(
      (await service.getCommandByNameOrAlias("guild-b", "hi"))?.createdBy,
    ).toBe("b");
  });
  test.each([
    "no json",
    "[]",
    '{"version":2,"commands":[]}',
    '{"version":1,"commands":"bad"}',
    '{"version":1,"commands":[{"name":"bad name"}]}',
    '{"version":1,"commands":[],"__proto__":{}}',
  ])("rejects invalid format/version without writes: %s", async (input) => {
    await expect(
      service.importCommands("guild-a", "a", input),
    ).rejects.toThrow();
    expect(repo.records).toEqual([]);
  });
  test("duplicate names or aliases reject the entire batch", async () => {
    const commands = [
      definition({ name: "first", aliases: ["shared"] }),
      definition({ name: "second", aliases: ["SHARED"] }),
    ];
    await expect(
      service.importCommands(
        "guild-a",
        "a",
        JSON.stringify({ version: 1, commands }),
      ),
    ).rejects.toThrow("already exists");
    expect(repo.records).toEqual([]);
  });
  test("existing command is not overwritten by import", async () => {
    const original = await service.createCommand("guild-a", "a", definition());
    await expect(
      service.importCommands(
        "guild-a",
        "a",
        await service.exportCommands("guild-a"),
      ),
    ).rejects.toThrow("already exists");
    expect(await service.getCommand("guild-a", "welcome")).toEqual(original);
  });
  test("malicious permissions, responses, schema metadata and names fail before any save", async () => {
    for (const bad of [
      { name: "x;DROP TABLE x" },
      { requiredUserPermissions: ["imaginary"] },
      { content: [{ type: "SCRIPT", text: "eval()" }] },
      { guildId: "other" },
      { content: [{ type: "TEXT", text: "{process.env}" }] },
    ]) {
      await expect(
        service.importCommands(
          "guild-a",
          "a",
          JSON.stringify({
            version: 1,
            commands: [{ ...definition(), ...bad }],
          }),
        ),
      ).rejects.toThrow();
    }
    expect(repo.records).toEqual([]);
  });
  test("reference validator is invoked and can fail closed before any creation", async () => {
    const validate = vi.fn().mockRejectedValue(new Error("Unknown role"));
    service = new CustomCommandService(
      repo,
      undefined,
      undefined,
      undefined,
      validate,
    );
    await expect(
      service.createCommand("guild-a", "a", definition()),
    ).rejects.toThrow("Unknown role");
    expect(repo.records).toEqual([]);
  });
});

test("empty exports are portable no-op imports", async () => {
  expect(
    await service.importCommands(
      "guild-a",
      "actor",
      await service.exportCommands("guild-b"),
    ),
  ).toBe(0);
  expect(repo.records).toEqual([]);
});
