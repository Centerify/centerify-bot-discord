import { afterEach, expect, test, vi } from "vitest";
import {
  Collection,
  PermissionFlagsBits as P,
  SlashCommandBuilder,
  PermissionsBitField,
} from "discord.js";
import type { Command } from "@sapphire/framework";
import plugin from "../../../plugins/better-ticket/src/index.js";
import { transcriptHtml, safeLink } from "../../../plugins/better-ticket/src/transcript.js";
import { harness, ids } from "../../helpers/betterTicket.js";
afterEach(() => vi.useRealTimers());

test("Better Ticket is its own module and serializes valid slash commands", () => {
  const f = harness();
  const definition = plugin(f.sdk);
  expect(definition.module.metadata.id).toBe("better-ticket");
  const command = definition.discord.commands!.bticket!;
  const builder = new SlashCommandBuilder();
  command.prototype.registerApplicationCommands!({
    registerChatInputCommand: (build: (builder: SlashCommandBuilder) => void) => build(builder),
  } as Command.Registry);
  expect(builder.toJSON().options!.length).toBeLessThanOrEqual(25);
  expect(builder.toJSON().options!.map((option) => option.name)).toEqual(
    expect.arrayContaining([
      "setup",
      "form",
      "claim",
      "priority",
      "note",
      "transcript",
      "rate",
      "queue",
      "stats",
    ]),
  );
});
test("opening creates explicit private overwrites and saved records", async () => {
  const f = harness();
  const ticket = await f.open();
  expect(ticket.status).toBe("OPEN");
  expect(f.guild.channels.create).toHaveBeenCalledWith(
    expect.objectContaining({
      permissionOverwrites: expect.arrayContaining([
        expect.objectContaining({ id: ids.guild, deny: expect.arrayContaining([P.ViewChannel]) }),
      ]),
    }),
  );
  expect(f.channel.send).toHaveBeenCalledWith(
    expect.objectContaining({ allowedMentions: { parse: [] } }),
  );
});
test("authorization denial stops before command effects", async () => {
  const f = harness();
  await f.runtime.store.saveProfile(ids.guild, f.profile);
  vi.mocked(f.sdk.authorize).mockResolvedValue(false);
  await f.runtime.command(f.input("open", ids.owner, { profile: "support" }) as never);
  expect(f.guild.channels.create).not.toHaveBeenCalled();
});
test("ordinary members cannot configure profiles or claim tickets", async () => {
  const f = harness();
  await f.open();
  const input = f.input("claim");
  await f.runtime.command(input as never);
  expect((await f.runtime.store.find(ids.guild, 1)).claimedBy).toBeNull();
  expect(input.editReply).toHaveBeenCalledWith(
    expect.objectContaining({ content: expect.stringContaining("support staff") }),
  );
});
test("failed private-log validation never persists setup", async () => {
  const f = harness();
  f.log.permissionsFor.mockReturnValue(new PermissionsBitField(PermissionsBitField.All));
  await f.runtime.command(f.input("setup", ids.manager, { profile: "support" }) as never);
  expect((await f.runtime.store.read(ids.guild)).profiles).toEqual({});
});
test("staff can claim, set priority and add private notes", async () => {
  const f = harness();
  await f.open();
  for (const [action, options] of [
    ["claim", {}],
    ["priority", { level: "urgent" }],
    ["note", { text: "PRIVATE STAFF DETAIL" }],
  ] as const)
    await f.runtime.command(f.input(action, ids.staff, options) as never);
  const saved = await f.runtime.store.find(ids.guild, 1);
  expect(saved.claimedBy).toBe(ids.staff);
  expect(saved.priority).toBe("urgent");
  expect(saved.notes[0].text).toBe("PRIVATE STAFF DETAIL");
});
test("ticket owners cannot read private staff notes", async () => {
  const f = harness();
  await f.open();
  await f.runtime.command(f.input("note", ids.staff, { text: "PRIVATE STAFF DETAIL" }) as never);
  const input = f.input("note");
  await f.runtime.command(input as never);
  expect(JSON.stringify(input.editReply.mock.calls)).not.toContain("PRIVATE STAFF DETAIL");
});
test("close archives first and leaves ordinary participants read-only", async () => {
  const f = harness();
  await f.open();
  await f.runtime.command(f.input("close", ids.owner, { reason: "Resolved" }) as never);
  const saved = await f.runtime.store.find(ids.guild, 1);
  expect(saved.status).toBe("CLOSED");
  expect(saved.transcript?.channelId).toBe(ids.log);
  expect(f.log.send).toHaveBeenCalledWith(
    expect.objectContaining({ files: expect.any(Array), allowedMentions: { parse: [] } }),
  );
  const overwrites = f.channel.edit.mock.calls[0][0].permissionOverwrites;
  for (const overwrite of overwrites) {
    if (overwrite.id === ids.bot) continue;
    expect(overwrite.deny).toContain(P.SendMessages);
    expect(overwrite.allow ?? []).not.toContain(P.SendMessages);
  }
  expect(f.channel.delete).not.toHaveBeenCalled();
});
test("failed transcript delivery preserves the channel and leaves a recoverable close", async () => {
  const f = harness();
  await f.open();
  f.log.send.mockRejectedValueOnce(new Error("upload failed"));
  await f.runtime.command(f.input("close") as never);
  expect(f.channel.edit).not.toHaveBeenCalled();
  expect(f.channel.delete).not.toHaveBeenCalled();
  expect((await f.runtime.store.find(ids.guild, 1)).status).toBe("CLOSING");
});
test("reopen restores private access; closed tickets can only be rated once by creator", async () => {
  const f = harness();
  await f.open();
  await f.runtime.command(f.input("close") as never);
  await f.runtime.command(f.input("rate", ids.owner, { stars: 5, comment: "Helpful" }) as never);
  await f.runtime.command(f.input("rate", ids.owner, { stars: 1 }) as never);
  expect((await f.runtime.store.find(ids.guild, 1)).rating?.stars).toBe(5);
  await f.runtime.command(f.input("reopen", ids.staff) as never);
  expect((await f.runtime.store.find(ids.guild, 1)).status).toBe("OPEN");
});
test("participant changes and deletion enforce staff privileges and confirmation", async () => {
  const f = harness();
  await f.open();
  await f.runtime.command(f.input("add", ids.owner, { member: ids.other }) as never);
  expect(f.channel.permissionOverwrites.edit).not.toHaveBeenCalled();
  await f.runtime.command(f.input("add", ids.staff, { member: ids.other }) as never);
  expect((await f.runtime.store.find(ids.guild, 1)).participants).toEqual([ids.other]);
  await f.runtime.command(f.input("close") as never);
  await f.runtime.command(f.input("delete", ids.staff, { confirm: false }) as never);
  expect(f.channel.delete).not.toHaveBeenCalled();
  await f.runtime.command(f.input("delete", ids.staff, { confirm: true }) as never);
  expect(f.channel.delete).toHaveBeenCalledOnce();
  expect((await f.runtime.store.find(ids.guild, 1)).status).toBe("DELETED");
});
test("unrelated viewers cannot use ticket controls even if Discord permissions were loosened", async () => {
  const f = harness();
  await f.open();
  const input = f.input("transcript", ids.other);
  await f.runtime.command(input as never);
  expect(f.log.send).not.toHaveBeenCalled();
  expect(input.editReply).toHaveBeenCalledWith(
    expect.objectContaining({ content: expect.stringContaining("not a participant") }),
  );
});
test("transcripts escape HTML, block unsafe URLs and exclude internal notes", async () => {
  const f = harness();
  const ticket = await f.open();
  ticket.notes.push({ by: ids.staff, text: "INTERNAL-ONLY", at: Date.now() });
  const html = transcriptHtml(
    ticket,
    [
      {
        id: "1",
        author: "<script>",
        authorId: ids.owner,
        content: '<img src=x onerror="alert(1)">',
        createdAt: "today",
        edited: false,
        attachments: [{ name: "bad", url: "javascript:alert(1)" }],
        embeds: [],
      },
    ],
    false,
  );
  expect(html).not.toContain("INTERNAL-ONLY");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("javascript:");
  expect(html).toContain("&lt;img");
  expect(safeLink("https://example.com/?x=1&y=2")).toContain("&amp;");
});
test("old modal submissions reject changed forms", async () => {
  const f = harness();
  await f.runtime.store.saveProfile(ids.guild, {
    ...f.profile,
    questions: [{ label: "Subject", required: true }],
  });
  const input = {
    ...f.input(""),
    customId: "bt:form:support:999",
    isModalSubmit: () => true,
    fields: { getTextInputValue: () => "help" },
  };
  await f.runtime.component(input as never);
  expect(f.guild.channels.create).not.toHaveBeenCalled();
  expect(input.editReply).toHaveBeenCalledWith(
    expect.objectContaining({ content: expect.stringContaining("form changed") }),
  );
});
test("panel forms show a modal before acknowledgement and defer creation until submit", async () => {
  const f = harness();
  await f.runtime.store.saveProfile(ids.guild, {
    ...f.profile,
    questions: [{ label: "Subject", required: true }],
  });
  const input = {
    ...f.input(""),
    deferred: false,
    replied: false,
    customId: "bt:open:support",
    isButton: () => true,
  };
  await f.runtime.component(input as never);
  expect(input.showModal).toHaveBeenCalledOnce();
  expect(input.deferReply).not.toHaveBeenCalled();
  expect(f.guild.channels.create).not.toHaveBeenCalled();
});
test("inactivity maintenance respects owner verification", async () => {
  vi.useFakeTimers();
  const f = harness();
  await f.runtime.store.saveProfile(ids.guild, { ...f.profile, autoCloseMinutes: 1 });
  await f.runtime.command(f.input("open", ids.owner, { profile: "support" }) as never);
  vi.setSystemTime(Date.now() + 120000);
  vi.mocked(f.sdk.verified).mockResolvedValue(false);
  const client = { guilds: { cache: new Collection([[ids.guild, f.guild]]) } };
  await f.runtime.sweep(client as never);
  expect((await f.runtime.store.find(ids.guild, 1)).status).toBe("OPEN");
  vi.mocked(f.sdk.verified).mockResolvedValue(true);
  await f.runtime.sweep(client as never);
  expect((await f.runtime.store.find(ids.guild, 1)).status).toBe("CLOSED");
});
test("failed ticket creation recovers an orphan channel after a restart", async () => {
  vi.useFakeTimers();
  const f = harness();
  await f.runtime.store.saveProfile(ids.guild, f.profile);
  await f.runtime.store.reserve(ids.guild, "support", ids.owner, new Set(), {});
  f.channel.topic = `better-ticket:v1:${ids.bot}:1:${ids.owner}`;
  f.channels.set(f.channel.id, f.channel);
  vi.setSystemTime(Date.now() + 121000);
  await f.runtime.sweep({ guilds: { cache: new Collection([[ids.guild, f.guild]]) } } as never);
  expect((await f.runtime.store.find(ids.guild, 1)).status).toBe("OPEN");
  expect(f.guild.channels.create).not.toHaveBeenCalled();
});
