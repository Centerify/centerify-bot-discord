import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  all: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  first: vi.fn(),
  update: vi.fn(),
  where: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../../src/adapters/prisma/client.js", () => ({
  db: {
    orm: {
      public: {
        CustomResponse: {
          create: mocks.create,
          where: mocks.where,
        },
      },
    },
    raw: { sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      returnsRow: () => ({ build: () => ({ sql: strings.join("?"), values }) }),
    }) },
    transaction: mocks.transaction,
  },
}));

import { CustomResponseService, type CustomResponseKind } from "../../src/modules/custom-commands/application/CustomResponseService.js";

import { PrismaLegacyResponseRepository } from "../../src/modules/custom-commands/infrastructure/PrismaLegacyResponseRepository.js";
const service = new CustomResponseService(new PrismaLegacyResponseRepository());
const validInput = {
  guildId: "guild-a",
  name: "rules",
  kind: "command" as CustomResponseKind,
  trigger: "rules",
  response: "Hello {user}",
  channelId: null,
  allowedRoleId: null,
  adminOnly: false,
  exactMatch: true,
  embed: false,
  cooldownSeconds: 0,
  createdBy: "owner",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.where.mockReturnValue({
    all: mocks.all,
    delete: mocks.delete,
    first: mocks.first,
    update: mocks.update,
  });
  mocks.all.mockResolvedValue([]);
  mocks.create.mockResolvedValue({ id: 1, ...validInput, enabled: true });
  mocks.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn({
    query: mocks.query,
    orm: { public: { CustomResponse: { where: mocks.where, create: mocks.create }, CustomCommandName: { where: () => ({ all: async () => [] }) } } },
  }));
});

test("creates a guild-scoped rule after validating its fields", async () => {
  await service.create(validInput);
  expect(mocks.where).toHaveBeenCalledWith({ guildId: "guild-a" });
  expect(mocks.create).toHaveBeenCalledWith(validInput);
  const lock = mocks.query.mock.calls[0]![0];
  expect(lock.sql).toContain("pg_advisory_xact_lock");
  expect(lock.values).toEqual(["centerify:custom-responses:guild-a"]);
  expect(mocks.query.mock.invocationCallOrder[0]).toBeLessThan(mocks.all.mock.invocationCallOrder[0]!);
  expect(mocks.all.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0]!);
});

test.each([
  [{ ...validInput, name: "Bad Name" }, "Name must be"],
  [{ ...validInput, kind: "unknown" as CustomResponseKind }, "Kind must be"],
  [{ ...validInput, trigger: "bad trigger" }, "Command trigger must be"],
  [{ ...validInput, response: "" }, "Response must be"],
  [{ ...validInput, cooldownSeconds: 3601 }, "Cooldown must be"],
  [{ ...validInput, cooldownSeconds: 1.5 }, "Cooldown must be"],
  [{ ...validInput, cooldownSeconds: Number.NaN }, "Cooldown must be"],
  [{ ...validInput, kind: "member_join" as const }, "need an output channel"],
])("rejects invalid input before writing", async (input, message) => {
  await expect(service.create(input)).rejects.toThrow(message);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});

test("failure to acquire the server lock prevents rule reads and writes", async () => {
  const error = new Error("Database unavailable");
  mocks.query.mockRejectedValue(error);
  await expect(service.create(validInput)).rejects.toBe(error);
  expect(mocks.all).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});

test("enforces the per-server rule limit without counting other servers", async () => {
  mocks.all.mockResolvedValue(Array.from({ length: 25 }, (_, id) => ({ id, name: `rule-${id}` })));
  await expect(service.create(validInput)).rejects.toThrow("at most 25");
  expect(mocks.where).toHaveBeenCalledWith({ guildId: "guild-a" });
  expect(mocks.create).not.toHaveBeenCalled();
});

test("rejects duplicate names and command triggers within a guild", async () => {
  mocks.all.mockResolvedValue([{ name: "rules", kind: "member_join", trigger: "join" }]);
  await expect(service.create(validInput)).rejects.toThrow("name already exists");

  mocks.all.mockResolvedValue([{ name: "other", kind: "command", trigger: "rules" }]);
  await expect(service.create(validInput)).rejects.toThrow("trigger is already in use");
});

test("turns a concurrent database name conflict into a user-facing error", async () => {
  mocks.create.mockRejectedValue({ sqlState: "23505", constraint: "custom_response_guildId_name_key" });
  await expect(service.create(validInput)).rejects.toThrow("name already exists");
});

test("updates and deletes only the named rule in the requested guild", async () => {
  mocks.first.mockResolvedValue({ id: 1 });
  await expect(service.setEnabled("guild-a", "rules", false)).resolves.toBe(true);
  expect(mocks.where).toHaveBeenLastCalledWith({ guildId: "guild-a", name: "rules" });
  expect(mocks.update).toHaveBeenCalledWith({ enabled: false });

  await expect(service.setResponse("guild-a", "rules", "Updated")).resolves.toBe(true);
  expect(mocks.update).toHaveBeenCalledWith({ response: "Updated" });

  await expect(service.remove("guild-a", "rules")).resolves.toBe(true);
  expect(mocks.delete).toHaveBeenCalledOnce();
});

test("missing rules are left unchanged", async () => {
  mocks.first.mockResolvedValue(null);
  await expect(service.setEnabled("guild-a", "missing", true)).resolves.toBe(false);
  await expect(service.setResponse("guild-a", "missing", "Updated")).resolves.toBe(false);
  await expect(service.remove("guild-a", "missing")).resolves.toBe(false);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.delete).not.toHaveBeenCalled();
});
