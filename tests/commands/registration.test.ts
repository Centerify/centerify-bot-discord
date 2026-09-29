import { expect, test, vi } from "vitest";
import { readdir } from "node:fs/promises";
import { SlashCommandBuilder } from "discord.js";
vi.mock("../../src/prisma/db.js", () => ({ db: {} }));

test("all command builders serialize valid unique names and stay within option limits", async () => {
  const root = new URL("../../src/commands/", import.meta.url);
  const names: string[] = [];
  for (const category of await readdir(root)) {
    const directory = new URL(`${category}/`, root);
    for (const file of await readdir(directory)) {
      if (!file.endsWith(".ts")) continue;
      const exports = await import(new URL(file, directory).href);
      const command = Object.values(exports).find((value: any) => typeof value === "function" && value.prototype?.registerApplicationCommands) as any;
      expect(command, `${category}/${file}`).toBeDefined();
      command.prototype.registerApplicationCommands({ registerChatInputCommand: (build: (builder: SlashCommandBuilder) => void) => {
        const builder = new SlashCommandBuilder();
        build(builder);
        const data = builder.toJSON();
        expect(data.options?.length ?? 0).toBeLessThanOrEqual(25);
        const options = data.options?.map((option) => option.name) ?? [];
        expect(new Set(options).size).toBe(options.length);
        names.push(data.name);
      } });
    }
  }
  expect(new Set(names).size).toBe(names.length);
  expect(names).toContain("setup");
  expect(names).toContain("settings");
  expect(names).toContain("unverify");
  expect(names).not.toContain("welcome");
  expect(names).not.toContain("logging");
});
