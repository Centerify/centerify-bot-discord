import { describe, expect, test } from "vitest";
import {
  CustomCommandVariableResolver,
  parseArguments,
} from "../../../src/modules/custom-commands/discord/CustomCommandVariableResolver.js";
import { CustomCommandValidator } from "../../../src/modules/custom-commands/domain/CustomCommandValidator.js";
import { CustomCommandRenderer } from "../../../src/modules/custom-commands/discord/CustomCommandRenderer.js";
import { CUSTOM_COMMAND_LIMITS as L } from "../../../src/modules/custom-commands/domain/constants.js";
import {
  CHANNEL,
  context,
  definition,
  record,
  ROLE,
  USER,
} from "./fixtures.js";
const variables = new CustomCommandVariableResolver();
const validator = new CustomCommandValidator(variables);
const renderer = new CustomCommandRenderer(variables, validator);

describe("controlled variable registry", () => {
  test("user, guild, channel, command, date, time and arguments resolve deterministically", async () => {
    const c = context({ args: ["John", "Doe"] });
    const input =
      "{user.id}|{user.name}|{user.displayName}|{user.mention}|{guild.id}|{guild.name}|{guild.memberCount}|{channel.id}|{channel.name}|{channel.mention}|{command.name}|{args}|{args.0}|{args.1}|{args.2}";
    expect(await variables.render(input, c)).toBe(
      `${USER}|Alex|Alex|<@${USER}>|guild-a|Centerify Community|42|${CHANNEL}|general|<#${CHANNEL}>|welcome|John Doe|John|Doe|`,
    );
    expect(await variables.render("{date} {time}", c)).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    );
  });
  test.each([
    "{missing}",
    "{args.25}",
    "{args.-1}",
    "{args.01}",
    "{",
    "}",
    "{{user.id}}",
    "{user.id",
    "{eval('1')}",
    "{process.env}",
    "{constructor.constructor('return process')()}",
  ])(
    "rejects unknown, malformed or executable-looking variables: %s",
    (input) => {
      expect(() => variables.validate(input)).toThrow();
    },
  );
  test("argument values are inserted once and never interpreted as code or template expressions", async () => {
    const c = context({
      args: ["{guild.id}", "process.exit()", "$(touch /tmp/bad)", "@everyone"],
    });
    expect(await variables.render("{args}", c)).toBe(c.args.join(" "));
    expect(
      await variables.render("eval(); new Function(); DROP TABLE;", c),
    ).toBe("eval(); new Function(); DROP TABLE;");
  });
  test("registry supports async extension resolvers and rejects duplicate keys", async () => {
    const registry = new CustomCommandVariableResolver();
    registry.register({ key: "centerify.level", resolve: async () => "7" });
    expect(await registry.render("Level {centerify.level}", context())).toBe(
      "Level 7",
    );
    expect(() =>
      registry.register({ key: "user.id", resolve: () => "bad" }),
    ).toThrow("duplicate");
  });
  test("arguments and templates have count and size bounds", () => {
    expect(parseArguments("  John\n Doe\t ")).toEqual(["John", "Doe"]);
    expect(parseArguments("  ")).toEqual([]);
    expect(() => parseArguments("x ".repeat(26))).toThrow("25 arguments");
    expect(() => parseArguments("x".repeat(L.argumentInput + 1))).toThrow(
      "2000 characters",
    );
    expect(() => variables.validate("x".repeat(L.templateInput + 1))).toThrow(
      "too long",
    );
  });
});

describe("safe rendering strategies", () => {
  test("text mentions only the invoking user; mass and role mentions cannot notify", async () => {
    const c = context({
      command: record({
        content: [
          {
            type: "TEXT",
            text: `@everyone @here <@&${ROLE}> <@999999999999999999> {user.mention} {args}`,
          },
        ],
      }),
      args: ["@EVERYONE"],
    });
    const [payload] = await renderer.render(c);
    expect(payload!.content).not.toContain("@everyone");
    expect(payload!.content).not.toContain("@here");
    expect(payload!.allowedMentions).toEqual({
      parse: [],
      users: [USER],
      roles: [],
      repliedUser: false,
    });
  });
  test("embed title, description, author, footer, fields, media, timestamp and color", async () => {
    const c = context({
      command: record({
        responseType: "EMBED",
        content: [
          {
            type: "EMBED",
            embed: {
              title: "Welcome {user.name}",
              description: "{guild.name}",
              color: 0x5865f2,
              author: {
                name: "{user.displayName}",
                icon_url: "https://example.com/a.png",
              },
              footer: { text: "{command.name}" },
              thumbnail: { url: "https://example.com/thumb.png" },
              image: { url: "https://example.com/image.png" },
              timestamp: true,
              fields: [
                { name: "Members", value: "{guild.memberCount}", inline: true },
              ],
            },
          },
        ],
      }),
    });
    const [payload] = await renderer.render(c);
    const embed = payload!.embeds![0]!;
    const json = "toJSON" in embed ? embed.toJSON() : embed;
    expect(json).toMatchObject({
      title: "Welcome Alex",
      description: "Centerify Community",
      color: 0x5865f2,
      author: { name: "Alex" },
      footer: { text: "welcome" },
      fields: [{ name: "Members", value: "42", inline: true }],
    });
    expect(json.timestamp).toMatch(/^\d{4}-/);
  });
  test("multi-message output keeps order and one mention policy", async () => {
    const payloads = await renderer.render(
      context({
        command: record({
          responseType: "MULTI",
          content: [
            { type: "TEXT", text: "First" },
            { type: "EMBED", embed: { description: "Second" } },
            { type: "TEXT", text: "Third" },
          ],
        }),
      }),
    );
    expect(payloads[0]!.content).toBe("First");
    expect(payloads[1]!.embeds).toHaveLength(1);
    expect(payloads[2]!.content).toBe("Third");
    expect(payloads.every((p) => p.allowedMentions?.parse?.length === 0)).toBe(
      true,
    );
  });
  test("expanded text and embed fields fail before delivery instead of exceeding Discord limits", async () => {
    const c = context({
      args: ["x".repeat(1000)],
      command: record({
        content: [{ type: "TEXT", text: "{args}{args}{args}" }],
      }),
    });
    await expect(renderer.render(c)).rejects.toThrow("2000");
    c.command = record({
      responseType: "EMBED",
      content: [{ type: "EMBED", embed: { title: "{args}" } }],
    });
    await expect(renderer.render(c)).rejects.toThrow("256");
  });
});

describe("input and Discord limits", () => {
  test.each([
    { title: "x".repeat(257) },
    { description: "x".repeat(4097) },
    { author: { name: "x".repeat(257) } },
    { footer: { text: "x".repeat(2049) } },
    { fields: Array.from({ length: 26 }, () => ({ name: "n", value: "v" })) },
    { fields: [{ name: "x".repeat(257), value: "v" }] },
    { fields: [{ name: "n", value: "x".repeat(1025) }] },
    { description: "x".repeat(4096), footer: { text: "x".repeat(2048) } },
    { color: -1, title: "t" },
    { title: "test", timestamp: "invalid" },
    { title: "test", image: { url: "javascript:alert(1)" } },
    { title: "test", url: "https://user:password@example.com" },
    { title: "test", image: { url: "https://example.com/{args}" } },
    {
      title: "test",
      author: { name: "n", proxy_icon_url: "https://example.com" },
    },
    { video: { url: "https://example.com" } },
    {},
  ])("rejects invalid/malformed embed %#", (embed) => {
    expect(() => validator.embed(embed)).toThrow();
  });
  test("accepts exact text and embed size boundaries", () => {
    expect(
      validator.responses([{ type: "TEXT", text: "x".repeat(2000) }])[0],
    ).toBeDefined();
    expect(
      validator.embed({
        description: "x".repeat(4096),
        fields: [{ name: "x".repeat(256), value: "v".repeat(1024) }],
      }),
    ).toBeDefined();
  });
  test.each([
    { name: "bad name" },
    { name: " " },
    { name: "x".repeat(101) },
    { aliases: ["a", "A"] },
    { aliases: Array.from({ length: 11 }, (_, i) => `a${i}`) },
    { allowedRoleIds: ["not-a-snowflake"] },
    { requiredUserPermissions: ["not-real"] },
    { requiredBotPermissions: ["__proto__"] },
    { cooldownSeconds: -1 },
    { cooldownSeconds: 86401 },
    { cooldownSeconds: 1.5 },
    { cooldownSeconds: NaN },
    { cooldownScope: "unknown" },
    { triggerType: "unknown" },
    { responseType: "SCRIPT" },
    { enabled: "true" },
    { description: "x".repeat(101) },
    { content: [{ type: "TEXT", text: "x".repeat(2001) }] },
    { content: [] },
    { content: [{ type: "TEXT", text: "ok", embed: {} }] },
    { content: [{ type: "EMBED", text: "ignored", embed: { title: "t" } }] },
    { content: [{ type: "TEXT", text: "{process.exit()}" }] },
    {
      content: Array.from({ length: 6 }, () => ({ type: "TEXT", text: "ok" })),
    },
    { responseType: "EMBED", content: [{ type: "TEXT", text: "ok" }] },
  ])("rejects invalid command definition %#", (patch) => {
    expect(() => validator.definition({ ...definition(), ...patch })).toThrow();
  });
});

test("explicit null configuration, NUL bytes and lone surrogates fail validation", () => {
  const validator = new CustomCommandValidator();
  for (const key of [
    "description",
    "enabled",
    "aliases",
    "cooldownSeconds",
    "cooldownScope",
    "triggerType",
    "responseType",
    "allowedRoleIds",
    "requiredUserPermissions",
    "deleteInvocation",
    "replyToInvocation",
  ]) {
    expect(() =>
      validator.definition({ ...definition(), [key]: null }),
    ).toThrow();
  }
  for (const text of ["bad\u0000text", "bad\ud800text"])
    expect(() =>
      validator.definition({
        ...definition(),
        content: [{ type: "TEXT", text }],
      }),
    ).toThrow("invalid Unicode");
});

test("advanced variables expose command context and preserve numeric arguments", async () => {
  const c = context({ args: ["one", "{user.name}", "three"] });
  expect(
    await variables.render(
      "{args.count}|{args.first}|{args.last}|{args.1}|{command.prefix}|{command.source}|{command.usageCount}|{member.roleCount}",
      c,
    ),
  ).toBe("3|one|three|{user.name}|!|message|0|1");
  expect(variables.keys().length).toBeGreaterThan(70);
  expect(
    await variables.render(
      "{member.joinedAt}|{member.boostingSince}|{guild.description}|{channel.topic}|{channel.parentId}",
      c,
    ),
  ).toBe("||||");
});

test("dynamic media expands approved URLs, omits missing images and validates expanded URLs", async () => {
  const c = context({
    command: record({
      responseType: "EMBED",
      content: [
        {
          type: "EMBED",
          embed: {
            title: "Profile",
            image: { url: "{user.avatar}" },
            thumbnail: { url: "{guild.icon}" },
            author: {
              name: "{user.name}",
              icon_url: "{user.avatar}",
              url: "https://example.com/profile",
            },
            footer: { text: "Server", icon_url: "{guild.icon}" },
          },
        },
      ],
    }),
  });
  c.member.user.displayAvatarURL = () =>
    "https://cdn.discordapp.com/avatar.png";
  c.guild.iconURL = () => null;
  const [payload] = await renderer.render(c);
  const embed = payload.embeds![0]!;
  const data = "toJSON" in embed ? embed.toJSON() : embed;
  expect(data.image?.url).toBe("https://cdn.discordapp.com/avatar.png");
  expect(data.thumbnail).toBeUndefined();
  expect(data.footer?.icon_url).toBeUndefined();
  expect(data.author?.icon_url).toBe(data.image?.url);
  c.member.user.displayAvatarURL = () =>
    "https://user:secret@example.com/image";
  await expect(renderer.render(c)).rejects.toThrow("HTTPS");
  for (const url of [
    "{args}",
    "{user.name}",
    "https://example.com/{user.avatar}",
    "{process.env.TOKEN}",
  ])
    expect(() =>
      validator.embed({ title: "Invalid", image: { url } }),
    ).toThrow();
});

test("an image-only embed with an unavailable dynamic image fails before sending", async () => {
  const c = context({
    command: record({
      responseType: "EMBED",
      content: [{ type: "EMBED", embed: { image: { url: "{guild.icon}" } } }],
    }),
  });
  c.guild.iconURL = () => null;
  await expect(renderer.render(c)).rejects.toThrow("text or an image");
});
