import { beforeEach, expect, test, vi } from "vitest";
import { PermissionFlagsBits, type Client, type Guild } from "discord.js";
import {
  CustomCommandSharingService,
  CustomCommandSharingConflictError,
  type CommandSharing,
  type SharingRepository,
} from "../../../src/services/customCommands/CustomCommandSharingService.js";
import { record } from "./fixtures.js";
const repository: SharingRepository = {
  get: vi.fn(),
  candidates: vi.fn(),
  save: vi.fn(),
  hasLegacyName: vi.fn(),
};
const commands = {
  listCommands: vi.fn(),
  invalidate: vi.fn(),
  isReserved: vi.fn(),
};
const verified = vi.fn();
const service = new CustomCommandSharingService(repository, commands, verified);
function guild(id: string, admin = true) {
  const value = {
    id,
    name: id,
    ownerId: "owner",
    members: {
      fetch: vi.fn().mockResolvedValue({
        permissions: {
          has: (bit: bigint) =>
            admin && bit === PermissionFlagsBits.Administrator,
        },
      }),
    },
    fetch: vi.fn(),
  };
  value.fetch.mockResolvedValue(value);
  return value as unknown as Guild;
}
let source: Guild, target: Guild, client: Client;
const sharing = (patch: Partial<CommandSharing> = {}): CommandSharing => ({
  guildId: "guild-a",
  commandId: 1,
  actorId: "admin",
  scope: "all",
  selectedGuildIds: "",
  ...patch,
});
beforeEach(() => {
  vi.resetAllMocks();
  verified.mockResolvedValue(true);
  commands.listCommands.mockImplementation(async (id) =>
    id === "guild-a" ? [record({ aliases: ["hi"] })] : [],
  );
  vi.mocked(repository.candidates).mockResolvedValue([sharing()]);
  source = guild("guild-a");
  target = guild("guild-b");
  client = {
    guilds: {
      cache: new Map([
        [source.id, source],
        [target.id, target],
      ]),
    },
  } as unknown as Client;
});
test("one global definition resolves in an authorized server with the original identity", async () => {
  const found = await service.resolve(client, target, "HI");
  expect(found).toMatchObject({
    id: 1,
    guildId: "guild-b",
    sourceGuildId: "guild-a",
    name: "welcome",
  });
  expect(repository.save).not.toHaveBeenCalled();
  expect(commands.invalidate).toHaveBeenCalledWith("guild-a");
});
test("selected scope includes only chosen servers, and changes are read from the source", async () => {
  vi.mocked(repository.candidates).mockResolvedValue([
    sharing({ scope: "selected", selectedGuildIds: "guild-c" }),
  ]);
  expect(await service.resolve(client, target, "welcome")).toBeNull();
  vi.mocked(repository.candidates).mockResolvedValue([
    sharing({ scope: "selected", selectedGuildIds: "guild-b" }),
  ]);
  commands.listCommands.mockResolvedValue([record({ description: "Edited" })]);
  expect(await service.resolve(client, target, "welcome")).toMatchObject({
    description: "Edited",
  });
});
test.each(["source", "target"])(
  "sharing stops when %s access or ownership verification is revoked",
  async (side) => {
    const affected = side === "source" ? source : target;
    verified.mockImplementation(async (guild) => guild.id !== affected.id);
    expect(await service.resolve(client, target, "welcome")).toBeNull();
    verified.mockResolvedValue(true);
    const revoked = guild(affected.id, false);
    client.guilds.cache.set(affected.id, revoked);
    expect(
      await service.resolve(
        client,
        side === "target" ? revoked : target,
        "welcome",
      ),
    ).toBeNull();
  },
);
test("disabled, removed, renamed, or server-restricted definitions never become runnable remotely", async () => {
  for (const records of [
    [],
    [record({ enabled: false })],
    [record({ name: "renamed" })],
    [record({ deniedRoleIds: ["123456789012345678"] })],
    [record({ allowedChannelIds: ["123456789012345678"] })],
  ]) {
    commands.listCommands.mockResolvedValue(records);
    expect(await service.resolve(client, target, "welcome")).toBeNull();
  }
});
test("built-ins, local legacy triggers, and ambiguous shared commands fail closed", async () => {
  commands.isReserved.mockReturnValue(true);
  expect(await service.resolve(client, target, "welcome")).toBeNull();
  commands.isReserved.mockReturnValue(false);
  vi.mocked(repository.hasLegacyName).mockResolvedValue(true);
  expect(await service.resolve(client, target, "welcome")).toBeNull();
  vi.mocked(repository.hasLegacyName).mockResolvedValue(false);
  const other = guild("guild-c");
  client.guilds.cache.set(other.id, other);
  vi.mocked(repository.candidates).mockResolvedValue([
    sharing(),
    sharing({ guildId: other.id, commandId: 2 }),
  ]);
  commands.listCommands.mockImplementation(async (id) => [
    record({ id: id === other.id ? 2 : 1, guildId: id }),
  ]);
  expect(await service.resolve(client, target, "welcome")).toBeNull();
});
test("saving scopes writes a reference only, removing it restores local-only behavior", async () => {
  const command = record();
  await service.save(client, "admin", command, "all", []);
  expect(repository.save).toHaveBeenLastCalledWith(command, sharing());
  await service.save(client, "admin", command, "selected", [
    source.id,
    target.id,
    target.id,
  ]);
  expect(repository.save).toHaveBeenLastCalledWith(
    command,
    sharing({ scope: "selected", selectedGuildIds: target.id }),
  );
  await service.save(client, "admin", command, "server", []);
  expect(repository.save).toHaveBeenLastCalledWith(command, null);
});
test("sharing writes reject foreign servers, missing permissions, empty selection, and server restrictions", async () => {
  await expect(
    service.save(client, "admin", record(), "selected", ["foreign"]),
  ).rejects.toThrow("Every selected");
  await expect(
    service.save(client, "admin", record(), "selected", []),
  ).rejects.toThrow("Choose 1");
  await expect(
    service.save(
      client,
      "admin",
      record({ deniedChannelIds: ["123456789012345678"] }),
      "all",
      [],
    ),
  ).rejects.toThrow("Clear server-specific");
  verified.mockResolvedValue(false);
  await expect(
    service.save(client, "admin", record(), "all", []),
  ).rejects.toThrow("Administrator");
  expect(repository.save).not.toHaveBeenCalled();
});

test("server discovery hides unverified and inaccessible servers, then saving rechecks the chosen server", async () => {
  const unverified = guild("unverified"),
    inaccessible = guild("inaccessible", false),
    unavailable = guild("unavailable");
  vi.mocked(unavailable.members.fetch).mockRejectedValue(
    new Error("member lookup failed"),
  );
  for (const item of [unverified, inaccessible, unavailable])
    client.guilds.cache.set(item.id, item);
  verified.mockImplementation(async (guild) => guild.id !== unverified.id);
  const choices = await service.discover(client, "admin", source.id);
  expect(choices).toEqual([{ id: target.id, name: target.name }]);
  expect(target.members.fetch).toHaveBeenCalledWith({
    user: "admin",
    force: true,
  });
  client.guilds.cache.set(target.id, guild(target.id, false));
  await expect(
    service.save(
      client,
      "admin",
      record(),
      "selected",
      choices.map((choice) => choice.id),
    ),
  ).rejects.toThrow("Every selected server");
  expect(repository.save).not.toHaveBeenCalled();
});

test("a verified server owner can share without a separate Administrator permission grant", async () => {
  const owned = guild("guild-a", false);
  owned.ownerId = "admin";
  client.guilds.cache.set(owned.id, owned);
  expect(await service.canManage(owned, "admin")).toBe(true);
  await service.save(client, "admin", record(), "all", []);
  expect(repository.save).toHaveBeenCalledWith(record(), sharing());
});

async function warning(
  command = record({ aliases: ["hi"] }),
  scope: "all" | "selected" = "selected",
  ids = [target.id],
) {
  try {
    await service.save(client, "admin", command, scope, ids);
    throw new Error("Expected a duplicate warning");
  } catch (error) {
    expect(error).toBeInstanceOf(CustomCommandSharingConflictError);
    return error as CustomCommandSharingConflictError;
  }
}

test.each(["name", "alias", "legacy", "shared"])(
  "%s collisions warn before writing and Proceed preserves the existing definitions",
  async (kind) => {
    const command = record({ aliases: ["hi"] });
    const duplicate = record({
      id: 2,
      guildId: target.id,
      name: kind === "name" ? "welcome" : "other",
      aliases: kind === "alias" ? ["hi"] : [],
    });
    commands.listCommands.mockImplementation(async (id) => {
      if (id === source.id) return [command];
      if (id === target.id)
        return kind === "name" || kind === "alias" ? [duplicate] : [];
      return [record({ id: 3, guildId: id, name: "third", aliases: ["hi"] })];
    });
    if (kind === "legacy")
      vi.mocked(repository.hasLegacyName).mockImplementation(
        async (id, name) => id === target.id && name === "hi",
      );
    if (kind === "shared") {
      const other = guild("guild-c");
      client.guilds.cache.set(other.id, other);
      vi.mocked(repository.candidates).mockImplementation(async (name) =>
        name === "hi" ? [sharing({ guildId: other.id, commandId: 3 })] : [],
      );
    }
    const error = await warning(command);
    expect(error.conflicts).toEqual([
      {
        guildId: target.id,
        guildName: target.name,
        names: [kind === "name" ? "welcome" : "hi"],
      },
    ]);
    expect(repository.save).not.toHaveBeenCalled();
    await service.save(
      client,
      "admin",
      command,
      "selected",
      [target.id],
      error.fingerprint,
    );
    expect(repository.save).toHaveBeenCalledExactlyOnceWith(
      command,
      sharing({ scope: "selected", selectedGuildIds: target.id }),
    );
    if (kind === "shared") {
      vi.mocked(repository.candidates).mockReturnValue(
        Promise.resolve([
          sharing(),
          sharing({ guildId: "guild-c", commandId: 3 }),
        ]),
      );
      expect(await service.resolve(client, target, "hi")).toBeNull();
    }
  },
);

test("all-server scope warns only for currently eligible destinations", async () => {
  const denied = guild("denied", false);
  client.guilds.cache.set(denied.id, denied);
  commands.listCommands.mockResolvedValue([record({ name: "welcome" })]);
  const error = await warning(record(), "all", []);
  expect(error.conflicts.map((conflict) => conflict.guildId)).toEqual([
    target.id,
  ]);
  expect(commands.listCommands).not.toHaveBeenCalledWith(denied.id);
  await service.save(client, "admin", record(), "all", [], error.fingerprint);
  expect(repository.save).toHaveBeenCalledOnce();
});

test("Proceed rechecks duplicates and binds consent to the command, scope and selection", async () => {
  commands.listCommands.mockImplementation(async (id) =>
    id === target.id ? [record()] : [],
  );
  const command = record({ aliases: ["hi"] });
  const error = await warning(command);
  await expect(
    service.save(client, "admin", command, "all", [], error.fingerprint),
  ).rejects.toBeInstanceOf(CustomCommandSharingConflictError);
  const extra = guild("extra");
  client.guilds.cache.set(extra.id, extra);
  await expect(
    service.save(
      client,
      "admin",
      command,
      "selected",
      [target.id, extra.id],
      error.fingerprint,
    ),
  ).rejects.toBeInstanceOf(CustomCommandSharingConflictError);
  await expect(
    service.save(
      client,
      "admin",
      record({ id: 2 }),
      "selected",
      [target.id],
      error.fingerprint,
    ),
  ).rejects.toBeInstanceOf(CustomCommandSharingConflictError);
  await expect(
    service.save(
      client,
      "admin",
      record({ updatedAt: "new-revision" }),
      "selected",
      [target.id],
      error.fingerprint,
    ),
  ).rejects.toBeInstanceOf(CustomCommandSharingConflictError);
  commands.listCommands.mockResolvedValue([record({ aliases: ["hi"] })]);
  await expect(
    service.save(
      client,
      "admin",
      command,
      "selected",
      [target.id],
      error.fingerprint,
    ),
  ).rejects.toMatchObject({ conflicts: [{ names: ["hi", "welcome"] }] });
  expect(repository.save).not.toHaveBeenCalled();
});

test.each(["source", "target"])(
  "Proceed cannot bypass revoked %s permissions",
  async (side) => {
    commands.listCommands.mockResolvedValue([record()]);
    const error = await warning();
    client.guilds.cache.set(
      side === "source" ? source.id : target.id,
      guild(side === "source" ? source.id : target.id, false),
    );
    await expect(
      service.save(
        client,
        "admin",
        record({ aliases: ["hi"] }),
        "selected",
        [target.id],
        error.fingerprint,
      ),
    ).rejects.toThrow(
      side === "source" ? "source server" : "Every selected server",
    );
    expect(repository.save).not.toHaveBeenCalled();
  },
);

test("ineligible shared sources do not expose duplicate warnings or become runnable", async () => {
  const other = guild("guild-c", false);
  client.guilds.cache.set(other.id, other);
  vi.mocked(repository.candidates).mockResolvedValue([
    sharing({ guildId: other.id, commandId: 3 }),
  ]);
  await service.save(client, "admin", record(), "selected", [target.id]);
  expect(repository.save).toHaveBeenCalledOnce();
  expect(commands.listCommands).not.toHaveBeenCalledWith(other.id);
});

test("an incomplete duplicate scan fails closed without writing", async () => {
  vi.mocked(repository.candidates).mockResolvedValue(
    Array.from({ length: 101 }, () => sharing()),
  );
  await expect(
    service.save(client, "admin", record(), "selected", [target.id]),
  ).rejects.toThrow("Too many shared commands");
  expect(repository.save).not.toHaveBeenCalled();
  vi.mocked(repository.candidates).mockResolvedValue([]);
  vi.mocked(repository.hasLegacyName).mockRejectedValue(
    new Error("database unavailable"),
  );
  await expect(
    service.save(client, "admin", record(), "selected", [target.id]),
  ).rejects.toThrow("database unavailable");
  expect(repository.save).not.toHaveBeenCalled();
});

test("all-server scope can be saved before any other server is eligible", async () => {
  client.guilds.cache.delete(target.id);
  await service.save(client, "admin", record(), "all", []);
  expect(repository.save).toHaveBeenCalledExactlyOnceWith(record(), sharing());
  expect(repository.candidates).not.toHaveBeenCalled();
});
