import { expect, test, vi } from "vitest";
import type { Command } from "@sapphire/framework";
vi.mock("../../../src/prisma/db.js", () => ({ db: {} }));
vi.mock("../../../src/logger.js", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
import { BanCommand } from "../../../src/commands/moderation/ban.js";
import { KickCommand } from "../../../src/commands/moderation/kick.js";
import { TimeoutCommand } from "../../../src/commands/moderation/timeout.js";
import { WarnCommand } from "../../../src/commands/moderation/warn.js";
import { UnwarnCommand } from "../../../src/commands/moderation/unwarn.js";
import { UnbanCommand } from "../../../src/commands/moderation/unban.js";
import { NoteCommand } from "../../../src/commands/moderation/note.js";
const commands = [BanCommand, KickCommand, TimeoutCommand, WarnCommand, UnwarnCommand, UnbanCommand, NoteCommand];

for (const command of commands) {
  test(`${command.name} rejects use outside a server`, async () => {
    const request = { inCachedGuild: () => false, reply: vi.fn() };
    await command.prototype.chatInputRun.call(Object.create(command.prototype), request as unknown as Command.ChatInputCommandInteraction);
    expect(request.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("inside a server") }));
  });
  test(`${command.name} rejects an empty reason or note before taking action`, async () => {
    const role = { comparePositionTo: () => -1 };
    const target = { id: "target", kickable: true, bannable: true, moderatable: true, roles: { highest: role } };
    const request = {
      inCachedGuild: () => true, guildId: "server", user: { id: "mod" },
      member: { id: "mod", permissions: { has: () => true }, roles: { highest: role } },
      guild: { ownerId: "owner", members: { me: { id: "bot", permissions: { has: () => true }, roles: { highest: role } }, fetch: vi.fn().mockResolvedValue(target) } },
      options: {
        getUser: () => ({ id: "target", bot: false, system: false }),
        getString: (name: string) => name === "duration" ? (command === TimeoutCommand ? "10m" : null) : name === "user-id" ? "123456789012345678" : "   ",
        getInteger: () => null, getBoolean: () => false, getSubcommand: () => "add",
      }, deferReply: vi.fn(), editReply: vi.fn(), reply: vi.fn(),
    };
    await command.prototype.chatInputRun.call(Object.create(command.prototype), request as unknown as Command.ChatInputCommandInteraction);
    expect(request.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("cannot be empty") }));
  });
}
