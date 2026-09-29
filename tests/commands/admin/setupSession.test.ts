import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ load: vi.fn(), handle: vi.fn() }));
vi.mock("../../../src/services/guildConfigService.js", () => ({ guildConfigService: { getOrCreate: mocks.load } }));
vi.mock("../../../src/services/setup/interactionHandler.js", () => ({ SetupInteractionHandler: class {} }));
vi.mock("../../../src/logger.js", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
import { SetupCommand } from "../../../src/commands/admin/setup.js";
function fixture() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const collector = { on: (event: string, callback: any) => { handlers[event] = callback; }, stop: vi.fn(), resetTimer: vi.fn() };
  const interaction = { id: "session", guildId: "guild", guild: {}, user: { id: "admin" }, deferred: true,
    member: { permissions: { has: () => true } }, inCachedGuild: () => true, deferReply: vi.fn(),
    editReply: vi.fn().mockResolvedValue({}), fetchReply: vi.fn().mockResolvedValue({ createMessageComponentCollector: () => collector }) };
  const renderer = { buildScreen: vi.fn().mockReturnValue({ embeds: [], components: [] }), buildExpiredScreen: vi.fn().mockReturnValue({ components: [] }) };
  const command = Object.create(SetupCommand.prototype) as SetupCommand;
  Object.assign(command, { renderer, interactionHandler: { handleComponent: mocks.handle, respondWithError: vi.fn() } });
  const component = (action = "xp", select = false) => ({ customId: `setup:session:${action}`, user: { id: "admin" },
    isButton: () => !select, isChannelSelectMenu: () => false, isRoleSelectMenu: () => false, isStringSelectMenu: () => select,
    deferred: false, reply: vi.fn() });
  const run = () => command.chatInputRun(interaction as never);
  return { handlers, collector, interaction, renderer, component, run };
}
beforeEach(() => { vi.resetAllMocks(); mocks.load.mockResolvedValue({ setupCompleted: true }); });
test("restored setup reuses precondition acknowledgement and expires reopened sessions", async () => {
  const f = fixture();
  await f.run();
  expect(f.interaction.deferReply).not.toHaveBeenCalled();
  await f.handlers.end();
  expect(f.renderer.buildExpiredScreen).toHaveBeenCalledOnce();
});
test("setup handles XP dropdowns and blocks concurrent actions", async () => {
  const f = fixture();
  await f.run();
  let finish!: (value: unknown) => void;
  mocks.handle.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const select = f.component("xp-methods", true);
  const first = f.handlers.collect(select);
  const second = f.component();
  await f.handlers.collect(second);
  expect(mocks.handle).toHaveBeenCalledWith(expect.objectContaining({ componentInteraction: select }));
  expect(mocks.handle).toHaveBeenCalledOnce();
  expect(second.reply).toHaveBeenCalledOnce();
  finish({ setupCompleted: true });
  await first;
});
test("finishing restored setup stops its collector without replacing the completed screen", async () => {
  const f = fixture();
  mocks.handle.mockImplementation(async ({ componentInteraction }) => { componentInteraction.deferred = true; return { setupCompleted: true }; });
  await f.run();
  await f.handlers.collect(f.component("finish"));
  expect(f.collector.stop).toHaveBeenCalledWith("finished");
  await f.handlers.end();
  expect(f.renderer.buildExpiredScreen).not.toHaveBeenCalled();
});
