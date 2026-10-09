import type { ComponentAction } from "../domain/types.js";
import { CustomCommandValidator } from "../domain/CustomCommandValidator.js";
import { CustomCommandVariableResolver } from "./CustomCommandVariableResolver.js";
import type { CustomCommandExecutionContext } from "./types.js";

/** Expand once, then validate the complete action before any side effects. */
export async function renderComponentAction(
  action: ComponentAction,
  context: CustomCommandExecutionContext,
  variables = new CustomCommandVariableResolver(),
): Promise<ComponentAction> {
  const data: Record<string, unknown> = { ...action };
  for (const field of [
    "userId",
    "channelId",
    "reason",
    "nickname",
    "text",
    "successMessage",
  ] as const) {
    if (typeof data[field] !== "string") continue;
    const value = await variables.render(data[field], context);
    data[field] =
      field === "userId"
        ? value.replace(/^<@!?(\d{17,20})>$/, "$1")
        : field === "channelId"
          ? value.replace(/^<#(\d{17,20})>$/, "$1")
          : value.replace(/@(everyone|here)/gi, "@\u200b$1");
  }
  if (action.action === "sequence")
    data.actions = await Promise.all(
      action.actions.map((step) =>
        renderComponentAction(step, context, variables),
      ),
    );
  return new CustomCommandValidator(variables).action(data, false);
}
