import { expect, test, vi } from "vitest";
import type { Command } from "@sapphire/framework";
import { SlashCommandBuilder } from "discord.js";
import { currentApplication } from "../../src/adapters/discord/context.js";
import { discordModuleToken } from "../../src/adapters/discord/modules.js";
vi.mock("../../src/adapters/prisma/client.js", () => ({ db: {} }));

test("module command contributions serialize valid unique names and stay within option limits", () => {
  const names: string[] = [];
  for (const { value: { definition } } of currentApplication().extensions(discordModuleToken)) {
    for (const command of Object.values(definition.commands ?? {})) {
      const registry = { registerChatInputCommand(build: (builder: SlashCommandBuilder) => void) {
        const builder = new SlashCommandBuilder();
        build(builder);
        const data = builder.toJSON();
        expect(data.options?.length ?? 0).toBeLessThanOrEqual(25);
        const options = data.options?.map((option) => option.name) ?? [];
        expect(new Set(options).size).toBe(options.length);
        names.push(data.name);
      } };
      command.prototype.registerApplicationCommands?.(registry as unknown as Command.Registry);
    }
  }
  expect(new Set(names).size).toBe(names.length);
  expect(names).toHaveLength(23);
  expect(names).toEqual(expect.arrayContaining(["setup", "settings", "unverify"]));
});
