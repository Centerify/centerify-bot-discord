import { beforeEach, expect, test, vi } from "vitest";
import { PermissionFlagsBits, type Client, type Guild } from "discord.js";
import {
  CustomCommandSharingService,
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
  commands.listCommands.mockResolvedValue([record({ aliases: ["hi"] })]);
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
