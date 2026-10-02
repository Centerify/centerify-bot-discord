import type {
  CustomCommandExecutionContext,
  VariableResolver,
} from "../../lib/customCommands/types.js";
import { CUSTOM_COMMAND_LIMITS as L } from "../../lib/customCommands/constants.js";
import { CustomCommandValidationError } from "../../lib/customCommands/errors.js";

export function parseArguments(input: string): string[] {
  if (input.length > L.argumentInput)
    throw new CustomCommandValidationError(
      `Arguments must be at most ${L.argumentInput} characters.`,
    );
  const args = input.trim() ? input.trim().split(/\s+/u) : [];
  if (args.length > L.arguments)
    throw new CustomCommandValidationError(
      `Use at most ${L.arguments} arguments.`,
    );
  return args;
}

export class CustomCommandVariableResolver {
  private readonly resolvers = new Map<string, VariableResolver>();
  public constructor() {
    const values: Record<string, (c: CustomCommandExecutionContext) => string> =
      {
        "user.id": (c) => c.userId,
        "user.name": (c) => c.member.user.username,
        "user.displayName": (c) => c.member.displayName,
        "user.mention": (c) => `<@${c.userId}>`,
        "guild.id": (c) => c.guildId,
        "guild.name": (c) => c.guild.name,
        "guild.memberCount": (c) => String(c.guild.memberCount),
        "channel.id": (c) => c.channelId,
        "channel.name": (c) => c.channel.name,
        "channel.mention": (c) => `<#${c.channelId}>`,
        "command.name": (c) => c.command.name,
        date: () => new Date().toISOString().slice(0, 10),
        time: () => new Date().toISOString().slice(11, 19),
        args: (c) => c.args.join(" "),
      };
    for (const [key, resolve] of Object.entries(values))
      this.register({ key, resolve });
  }
  public register(resolver: VariableResolver): void {
    if (
      !/^[a-zA-Z][a-zA-Z0-9.]*$/.test(resolver.key) ||
      this.resolvers.has(resolver.key)
    )
      throw new Error("Invalid or duplicate variable resolver.");
    this.resolvers.set(resolver.key, resolver);
  }
  private tokens(
    template: string,
  ): { start: number; end: number; key: string }[] {
    if (template.length > L.templateInput)
      throw new CustomCommandValidationError("Template is too long.");
    const tokens: { start: number; end: number; key: string }[] = [];
    for (let i = 0; i < template.length; i++) {
      if (template[i] === "}")
        throw new CustomCommandValidationError("Unmatched template brace.");
      if (template[i] !== "{") continue;
      const end = template.indexOf("}", i + 1);
      if (end === -1)
        throw new CustomCommandValidationError("Unmatched template brace.");
      const key = template.slice(i + 1, end);
      if (
        !this.resolvers.has(key) &&
        !/^args\.(?:[0-9]|1[0-9]|2[0-4])$/.test(key)
      )
        throw new CustomCommandValidationError(
          `Unknown variable {${key.slice(0, L.name)}}.`,
        );
      tokens.push({ start: i, end: end + 1, key });
      i = end;
    }
    return tokens;
  }
  public validate(template: string): void {
    this.tokens(template);
  }
  public async render(
    template: string,
    context: CustomCommandExecutionContext,
  ): Promise<string> {
    let result = "";
    let position = 0;
    for (const token of this.tokens(template)) {
      result += template.slice(position, token.start);
      result += token.key.startsWith("args.")
        ? (context.args[Number(token.key.slice(5))] ?? "")
        : await this.resolvers.get(token.key)!.resolve(context);
      if (result.length > L.templateInput)
        throw new CustomCommandValidationError("Rendered output is too long.");
      position = token.end;
    }
    result += template.slice(position);
    if (result.length > L.templateInput)
      throw new CustomCommandValidationError("Rendered output is too long.");
    return result;
  }
}
