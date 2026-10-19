import { expect, test } from "vitest";
import { TicketStore } from "../../../plugins/better-ticket/src/state.js";
import { ids, memorySdk, harness } from "../../helpers/betterTicket.js";

test("reservations are durable, sequential and enforce the active-ticket limit", async () => {
  const { sdk } = memorySdk();
  const store = new TicketStore(sdk, () => 100000);
  const profile = harness().profile;
  await store.saveProfile(ids.guild, profile);
  const attempts = await Promise.allSettled([
    store.reserve(ids.guild, "support", ids.owner, new Set(), {}),
    store.reserve(ids.guild, "support", ids.owner, new Set(), {}),
  ]);
  expect(attempts.filter((row) => row.status === "fulfilled")).toHaveLength(1);
  const restarted = new TicketStore(sdk);
  expect((await restarted.read(ids.guild)).tickets["1"].status).toBe("CREATING");
  expect((await restarted.read(ids.guild)).nextNumber).toBe(2);
});
test("server state and identically named departments are isolated", async () => {
  const { sdk } = memorySdk();
  const store = new TicketStore(sdk);
  await store.saveProfile(ids.guild, harness().profile);
  expect(Object.keys((await store.read(ids.other)).profiles)).toHaveLength(0);
  await expect(store.profile(ids.other, "support")).rejects.toThrow("not configured");
});
test("required roles, blocks, disabled departments and required forms reject reservations", async () => {
  for (const kind of ["role", "block", "disabled", "form"]) {
    const { sdk } = memorySdk();
    const store = new TicketStore(sdk);
    await store.saveProfile(ids.guild, {
      ...harness().profile,
      ...(kind === "role"
        ? { requiredRoleId: ids.support }
        : kind === "disabled"
          ? { enabled: false }
          : kind === "form"
            ? { questions: [{ label: "Subject", required: true }] }
            : {}),
    });
    if (kind === "block")
      await store.change(ids.guild, (state) => {
        state.blockedUserIds = [ids.owner];
      });
    await expect(store.reserve(ids.guild, "support", ids.owner, new Set(), {})).rejects.toThrow();
    expect(Object.keys((await store.read(ids.guild)).tickets)).toHaveLength(0);
  }
});
test("ticket settings are snapshotted and future profile edits do not disclose old tickets", async () => {
  const { sdk } = memorySdk();
  const store = new TicketStore(sdk);
  await store.saveProfile(ids.guild, harness().profile);
  const ticket = await store.reserve(ids.guild, "support", ids.owner, new Set(), {});
  await store.saveProfile(ids.guild, { ...harness().profile, supportRoleIds: [ids.other] });
  expect((await store.find(ids.guild, ticket.number)).profile.supportRoleIds).toEqual([
    ids.support,
  ]);
});
test("reopening enforces limits and blocklists before changing state", async () => {
  const f = harness();
  await f.open();
  await f.runtime.command(f.input("close") as never);
  await f.runtime.store.change(ids.guild, (state) => {
    state.blockedUserIds.push(ids.owner);
  });
  const closed = await f.runtime.store.find(ids.guild, 1);
  await expect(
    f.runtime.store.transition(ids.guild, closed, "REOPENING", ids.staff, "reopen"),
  ).rejects.toThrow("blocked");
  expect((await f.runtime.store.find(ids.guild, 1)).status).toBe("CLOSED");
});
test("inactivity closure rechecks activity inside the persisted mutation", async () => {
  const f = harness();
  const ticket = await f.open();
  await f.runtime.store.mutate(
    ids.guild,
    ticket.number,
    ["OPEN"],
    ids.owner,
    "activity",
    (value) => {
      value.lastActivityAt++;
    },
  );
  await expect(
    f.runtime.store.transition(
      ids.guild,
      ticket,
      "CLOSING",
      ids.bot,
      "idle",
      ticket.lastActivityAt,
    ),
  ).rejects.toThrow("activity changed");
});
test("bad department keys and corrupted data fail closed", async () => {
  const { sdk, data } = memorySdk();
  const store = new TicketStore(sdk);
  for (const key of ["../other", "constructor", "__proto__"])
    await expect(store.profile(ids.guild, key)).rejects.toThrow();
  data.set(ids.guild, { version: 99 });
  await expect(store.read(ids.guild)).rejects.toThrow();
});
test("failed storage mutations leave the previous data intact", async () => {
  const { sdk } = memorySdk();
  const store = new TicketStore(sdk);
  await store.saveProfile(ids.guild, harness().profile);
  await expect(
    store.change(ids.guild, (state) => {
      state.blockedUserIds.push(ids.owner);
      throw new Error("failed");
    }),
  ).rejects.toThrow();
  expect((await store.read(ids.guild)).blockedUserIds).toEqual([]);
});
