import type { ComponentAction } from "../domain/types.js";
import { CustomCommandValidator } from "../domain/CustomCommandValidator.js";
import {
  CustomCommandVariableResolver,
  type TemplateRender,
} from "./CustomCommandVariableResolver.js";
import type { CustomCommandExecutionContext } from "./types.js";
import { CustomCommandArgumentError } from "../domain/errors.js";
import { CUSTOM_COMMAND_PREFIX } from "../domain/constants.js";

/** Expand once, then validate the complete action before any side effects. */
export async function renderComponentAction(
  action: ComponentAction,
  context: CustomCommandExecutionContext,
  variables = new CustomCommandVariableResolver(),
  render: TemplateRender = variables.createSession(context),
): Promise<ComponentAction> {
  const data: Record<string, unknown> = { ...action };
  for (const field of [
    "userId",
    "channelId",
    "categoryId",
    "name",
    "topic",
    "reason",
    "nickname",
    "text",
    "successMessage",
  ] as const) {
    if (typeof data[field] !== "string") continue;
    const template = data[field];
    const value = await render(template);
    data[field] =
      field === "userId"
        ? value.replace(/^<@!?(\d{17,20})>$/, "$1")
        : field === "channelId" || field === "categoryId"
          ? value.replace(/^<#(\d{17,20})>$/, "$1")
          : value.replace(/@(everyone|here)/gi, "@\u200b$1");
    if (
      (field === "userId" || field === "channelId" || field === "categoryId") &&
      /^\{args(?:\.\d+|\.first|\.last)?\}$/.test(template) &&
      !/^\d{17,20}$/.test(data[field] as string)
    ) {
      const target =
        field === "userId"
          ? "member"
          : field === "categoryId"
            ? "category"
            : "channel";
      const usage = ["{args.0}", "{args.first}", "{args}"].includes(template)
        ? ` Usage: ${CUSTOM_COMMAND_PREFIX}${context.command.name} ${field === "userId" ? "@Member" : "#channel"}.`
        : "";
      throw new CustomCommandArgumentError(
        `${value ? "Invalid" : "Missing"} ${target} argument ${template}. Supply a ${target} mention or a 17–20 digit Discord ID.${usage}`,
      );
    }
  }
  if (action.action === "sequence")
    data.actions = await Promise.all(
      action.actions.map((step) =>
        renderComponentAction(step, context, variables, render),
      ),
    );
  return new CustomCommandValidator(variables).action(data, false);
}
