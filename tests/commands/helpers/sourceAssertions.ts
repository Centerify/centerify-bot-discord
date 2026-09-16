import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("../../..", import.meta.url)));
const commandsRoot = join(root, "src", "commands");

export type CommandCategory = "admin" | "general" | "moderation";

export interface CommandSource {
  file: string;
  source: string;
}

export async function readCommandSource(
  category: CommandCategory,
  name: string,
): Promise<CommandSource> {
  const file = `${category}/${name}.ts`;
  return {
    file,
    source: await readFile(join(commandsRoot, file), "utf8"),
  };
}

export function assertSapphireCommand({ file, source }: CommandSource, className: string) {
  assert.match(
    source,
    new RegExp(`export class ${className} extends Command`),
    `${file} must export ${className}`,
  );
  assert.match(
    source,
    /registerApplicationCommands/,
    `${file} must register application commands`,
  );
}

export function assertChatInputCommand(
  command: CommandSource,
  expected: {
    className: string;
    name: string;
    description?: string;
  },
) {
  assertSapphireCommand(command, expected.className);
  assert.match(command.source, new RegExp(`\\.setName\\("${expected.name}"\\)`));

  if (expected.description) {
    assert.match(
      command.source,
      new RegExp(`\\.setDescription\\("${escapeRegExp(expected.description)}"\\)`),
    );
  }
}

export function assertGuildCommand(command: CommandSource, permission?: string) {
  assert.match(command.source, /InteractionContextType\.Guild/);

  if (permission) {
    assert.match(
      command.source,
      new RegExp(`setDefaultMemberPermissions\\(PermissionFlagsBits\\.${permission}\\)`),
    );
  }
}

export function assertOption(
  command: CommandSource,
  optionType: "User" | "String" | "Integer" | "Channel",
  name: string,
  required?: boolean,
) {
  assert.match(command.source, new RegExp(`\\.add${optionType}Option`));
  assert.match(command.source, new RegExp(`\\.setName\\("${escapeRegExp(name)}"\\)`));

  if (required !== undefined) {
    assert.match(command.source, new RegExp(`\\.setRequired\\(${required}\\)`));
  }
}

export function assertUsesService(command: CommandSource, serviceName: string) {
  assert.match(command.source, new RegExp(`\\b${escapeRegExp(serviceName)}\\b`));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
