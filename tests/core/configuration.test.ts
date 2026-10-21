import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { z } from "zod";
import {
  configurationSchema,
  loadConfiguration,
  parseConfiguration,
  type CommandConfiguration,
} from "../../src/configuration.js";
import { parseEnvironment } from "../../src/bootstrap/config.js";
import { loadStartupEnvironment } from "../../src/bootstrap/environment.js";
import {
  applyBotIdentity,
  configuredPresence,
  validateCommandConfiguration,
} from "../../src/adapters/discord/configuration.js";
import type { Client } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { ApplicationCommandRegistries } from "@sapphire/framework";
import { configuredRegistry } from "../../src/adapters/discord/configuration.js";

const folders: string[] = [];
function directory() {
  const path = mkdtempSync(join(tmpdir(), "centerify-config-"));
  folders.push(path);
  return path;
}
afterEach(() => {
  for (const path of folders.splice(0)) rmSync(path, { recursive: true, force: true });
});

test("the shipped config is sparse and its editor schema is generated from runtime validation", () => {
  expect(loadConfiguration().commands).toEqual({});
  expect(JSON.parse(readFileSync("centerify.config.schema.json", "utf8"))).toEqual(
    z.toJSONSchema(configurationSchema),
  );
});

test("file overrides reuse module and logging parsing; explicit environment settings win", () => {
  const file = parseConfiguration({
    modules: { xp: false },
    logging: { level: "warn", format: "json" },
    startup: { shutdownTimeoutMs: 20000 },
    plugins: { stateDirectory: "state" },
  });
  const credentials = {
    DISCORD_TOKEN: "synthetic",
    DATABASE_URL: "postgresql://user:pass@localhost/db",
  };
  expect(parseEnvironment(credentials, file)).toMatchObject({
    modules: { xp: { enabled: false } },
    logging: { level: "warn", format: "json" },
    shutdownTimeoutMs: 20000,
    pluginStateDirectory: "state",
  });
  expect(
    parseEnvironment(
      {
        ...credentials,
        CENTERIFY_MODULES: '{"xp":true}',
        LOG_LEVEL: "error",
        LOG_FORMAT: "pretty",
        SHUTDOWN_TIMEOUT_MS: "30000",
        CENTERIFY_PLUGIN_STATE_DIR: "other",
      },
      file,
    ),
  ).toMatchObject({
    modules: { xp: { enabled: true } },
    logging: { level: "error", format: "pretty" },
    shutdownTimeoutMs: 30000,
    pluginStateDirectory: "other",
  });
});

test.each([
  { unknown: true },
  { bot: { token: "private-secret" } },
  { commands: { ping: { alias: [] } } },
  { startup: { loginTimeoutMs: 0 } },
  { modules: { xp: { enabled: "no" } } },
])("invalid configuration fails without exposing submitted values", (value) => {
  expect(() => parseConfiguration(value)).toThrow();
  try {
    parseConfiguration(value);
  } catch (error) {
    expect(String(error)).not.toContain("private-secret");
  }
});

test("default file is optional; explicitly selected missing or malformed files fail safely", () => {
  const cwd = directory();
  expect(loadConfiguration({}, cwd).modules).toEqual({});
  expect(() => loadConfiguration({ CENTERIFY_CONFIG: "missing.json" }, cwd)).toThrow("Cannot read");
  writeFileSync(join(cwd, "bad.json"), '{"token":"private-secret"');
  expect(() => loadConfiguration({ CENTERIFY_CONFIG: "bad.json" }, cwd)).toThrow("valid JSON");
});

test("envFile, CLI selection and shell precedence load secrets without putting them in JSON", () => {
  const cwd = directory();
  writeFileSync(join(cwd, "centerify.config.json"), JSON.stringify({ envFile: ".env.bot" }));
  writeFileSync(join(cwd, ".env.bot"), "DISCORD_TOKEN=from-file\nLOG_LEVEL=warn\n");
  const env: NodeJS.ProcessEnv = { DISCORD_TOKEN: "from-shell" };
  loadStartupEnvironment([], env, cwd);
  expect(env).toMatchObject({ DISCORD_TOKEN: "from-shell", LOG_LEVEL: "warn" });
  writeFileSync(join(cwd, "alternate.json"), "{}");
  writeFileSync(join(cwd, ".env.alternate"), "DISCORD_TOKEN=alternate\n");
  const alternate: NodeJS.ProcessEnv = {};
  loadStartupEnvironment(
    ["--config", "alternate.json", "--env-file", ".env.alternate"],
    alternate,
    cwd,
  );
  expect(alternate.DISCORD_TOKEN).toBe("alternate");
  expect(alternate.CENTERIFY_CONFIG).toBe("alternate.json");
  expect(() => loadStartupEnvironment(["--env-file", "missing"], {}, cwd)).toThrow(
    "Cannot read selected environment file",
  );
});

test("command overrides reject collisions, unknown commands and ownership lockouts", () => {
  const names = ["ping", "help", "verify", "unverify"];
  expect(() =>
    validateCommandConfiguration(names, { ping: { name: "latency", aliases: ["pong"] } }),
  ).not.toThrow();
  const invalid: CommandConfiguration[] = [
    { ping: { aliases: ["help"] } },
    { ping: { name: "latency", aliases: ["latency"] } },
    { typo: {} },
    { verify: { enabled: false } },
    { unverify: { name: "disable" } },
  ];
  for (const config of invalid) expect(() => validateCommandConfiguration(names, config)).toThrow();
});

test("bot identity updates are applied only when different and presence uses Discord activity types", async () => {
  const client = {
    user: { username: "Centerify", setUsername: vi.fn() },
    application: { description: "old", edit: vi.fn() },
  };
  await applyBotIdentity(client as unknown as Client<true>, { name: "My Bot", description: "new" });
  expect(client.user.setUsername).toHaveBeenCalledWith("My Bot");
  expect(client.application.edit).toHaveBeenCalledWith({ description: "new" });
  client.user.setUsername.mockClear();
  client.application.edit.mockClear();
  await applyBotIdentity(client as unknown as Client<true>, {
    name: "Centerify",
    description: "old",
  });
  expect(client.user.setUsername).not.toHaveBeenCalled();
  expect(client.application.edit).not.toHaveBeenCalled();
  expect(
    configuredPresence({
      presence: { status: "idle", activity: { name: "your server", type: "Watching" } },
    }),
  ).toEqual({ status: "idle", activities: [{ name: "your server", type: 3 }] });
});

test("plugin builder and raw registrations retain permissions and options when customized", () => {
  for (const [kind, input] of [
    [
      "builder",
      new SlashCommandBuilder()
        .setName("example")
        .setDescription("Original")
        .setDefaultMemberPermissions(8n)
        .addStringOption((option) => option.setName("text").setDescription("Text")),
    ],
    ["raw", { name: "example", description: "Original", defaultMemberPermissions: 8n }],
  ] as const) {
    const registry = ApplicationCommandRegistries.acquire(`config-test-${kind}`);
    configuredRegistry(registry, {
      name: "renamed",
      aliases: ["alias"],
      description: "Customized",
    }).registerChatInputCommand(input);
    const calls = (
      registry as unknown as {
        apiCalls: {
          builtData: {
            name: string;
            description: string;
            default_member_permissions: string;
            options?: unknown[];
          };
        }[];
      }
    ).apiCalls;
    expect(calls.map((call) => call.builtData.name)).toEqual(["renamed", "alias"]);
    expect(
      calls.every(
        (call) =>
          call.builtData.description === "Customized" &&
          call.builtData.default_member_permissions === "8",
      ),
    ).toBe(true);
    if (kind === "builder") expect(calls[0]!.builtData.options).toHaveLength(1);
  }
});
