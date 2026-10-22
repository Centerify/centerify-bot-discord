import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const origin = process.env.DASHBOARD_TEST_URL ?? "http://localhost:3001";
let cookie = "";
async function call(path, body, key = randomUUID(), options = {}) {
  const response = await fetch(`${origin}/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      origin,
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined ? { "idempotency-key": key } : {}),
      ...options.headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return { status: response.status, body: await response.json() };
}
assert.equal((await call("me")).status, 401, "Signed-out reads must be rejected");
assert.equal(
  (await call("demo", {}, randomUUID(), { headers: { origin: "https://invalid.example" } })).status,
  403,
  "Cross-origin writes must be rejected",
);
assert.equal(
  (await call("demo", {})).status,
  200,
  "Enable the explicitly configured demo for this smoke test",
);
const me = await call("me");
assert.equal(me.body.user.demo, true);
const guild = me.body.guilds.find((g) => g.installed).id,
  base = `guilds/${guild}/`;
assert.equal((await call("guilds/999999999999999999/settings")).status, 403, "Guild isolation");
const plugins = (await call(base + "plugins")).body;
assert.deepEqual(plugins.extensions, [], "No extension is installed by default");
assert.deepEqual(plugins.activations, [], "No plugin is activated by default");
assert.deepEqual(plugins.installed.plugins, {}, "No package is installed by default");
for (const page of [
  "overview",
  "members",
  "cases",
  "reports",
  "tickets",
  "commands",
  "settings",
  "resources",
  "workflows",
  "plugins",
  "audit",
])
  assert.equal((await call(base + page)).status, 200, `Read ${page}`);
const before = (await call(base + "cases")).body.length,
  key = randomUUID(),
  moderation = {
    action: "note",
    userIds: ["333333333333333300"],
    reason: "Synthetic dashboard smoke test",
    channelId: "666666666666666669",
  };
const first = await call(base + "moderation", moderation, key);
assert.equal(first.status, 200);
assert.equal(first.body.results[0].status, "simulated");
assert.equal((await call(base + "moderation", moderation, key)).status, 200);
assert.equal(
  (await call(base + "cases")).body.length,
  before + 1,
  "Sensitive replay must not duplicate effects",
);
assert.equal(
  (await call(base + "moderation", { ...moderation, reason: "Changed" }, key)).status,
  409,
);
const settings = (await call(base + "settings")).body;
assert.equal(
  (
    await call(base + "settings", {
      expectedUpdatedAt: settings.config.updatedAt,
      patch: { welcomeEnabled: false },
    })
  ).status,
  200,
);
assert.equal(
  (
    await call(base + "settings", {
      expectedUpdatedAt: settings.config.updatedAt,
      patch: { welcomeEnabled: true },
    })
  ).status,
  409,
);
const workflow = {
  version: 1,
  name: `smoke_${randomUUID().slice(0, 8)}`,
  description: "Synthetic test",
  nodes: [
    {
      id: "start",
      kind: "trigger",
      label: "Start",
      position: { x: 0, y: 0 },
      config: { event: "command" },
    },
    {
      id: "action",
      kind: "action",
      label: "Ban simulation",
      position: { x: 200, y: 0 },
      config: { action: "ban", userId: "333333333333333300", reason: "Simulation only" },
    },
  ],
  edges: [{ id: "e1", source: "start", target: "action", port: "next" }],
};
const test = await call(base + "workflows", {
  action: "test",
  name: workflow.name,
  revision: 0,
  definition: workflow,
  channelId: "666666666666666669",
  args: [],
});
assert.equal(test.status, 200);
assert.equal(test.body.status, "simulated");
assert.ok(test.body.trace.some((s) => s.status === "simulated"));
const cyclic = {
  ...workflow,
  edges: [...workflow.edges, { id: "cycle", source: "action", target: "start", port: "next" }],
};
assert.equal(
  (
    await call(base + "workflows", {
      action: "publish",
      name: workflow.name,
      revision: 0,
      definition: cyclic,
    })
  ).status,
  400,
);
const controller = new AbortController();
const events = await fetch(`${origin}/api/events?guildId=${guild}&cursor=0`, {
  headers: { cookie },
  signal: controller.signal,
});
assert.equal(events.status, 200);
assert.match(events.headers.get("content-type"), /text\/event-stream/);
const reader = events.body.getReader();
let text = "";
while (!text.includes("event: update")) {
  const part = await reader.read();
  assert.equal(part.done, false);
  text += new TextDecoder().decode(part.value);
}
assert.match(text, /id: \d+/);
controller.abort();
assert.equal((await call("health")).body.status, "demo");
console.log(
  "Dashboard HTTP smoke passed: authentication boundary, CSRF, guild isolation, resource reads, moderation idempotency, settings concurrency, safe workflow tests, cycle rejection, SSE and health.",
);
