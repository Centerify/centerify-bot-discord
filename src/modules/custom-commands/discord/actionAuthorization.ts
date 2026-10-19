import type { CustomCommandRecord } from "../domain/types.js";
import { isDeepStrictEqual } from "node:util";
import { CustomCommandPermissionError } from "../domain/errors.js";
import type { CustomCommandExecutionContext } from "./types.js";
import { CustomCommandPermissionService } from "./CustomCommandPermissionService.js";
import { guildOwnershipService } from "../../guilds/discord/index.js";

export async function authorizeComponentAction(
  context: CustomCommandExecutionContext,
  loadCommand: () => Promise<CustomCommandRecord | undefined>,
) {
  if (!(await guildOwnershipService.isVerified(context.guild)))
    throw new CustomCommandPermissionError(
      "Server ownership is no longer verified. Run /verify before using these controls.",
    );
  const command = await loadCommand();
  if (
    !command ||
    command.id !== context.command.id ||
    command.updatedAt !== context.command.updatedAt ||
    !isDeepStrictEqual(command.content, context.command.content)
  )
    throw new CustomCommandPermissionError(
      "This command has changed or was deleted. Run it again to use its controls.",
    );
  const [member, me] = await Promise.all([
    context.guild.members.fetch({ user: context.userId, force: true }),
    context.guild.members.fetchMe({ force: true }),
  ]);
  const current = { ...context, command, member, source: "button" as const };
  new CustomCommandPermissionService().check(current);
  return { context: current, me };
}
