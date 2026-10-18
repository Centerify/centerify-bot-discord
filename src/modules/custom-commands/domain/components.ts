import type {
  ComponentAction,
  EffectAction,
  ResponseTemplate,
  SequenceAction,
} from "./types.js";
import {
  customVariables,
  templateTokens,
  TEMPLATE_VARIABLE_KEYS,
} from "./variables.js";
import { CUSTOM_COMMAND_LIMITS as L } from "./constants.js";
import { CustomCommandValidationError } from "./errors.js";

function staticTargets(
  content: ResponseTemplate[],
): (value: string) => string | undefined {
  const variables = customVariables(content);
  const keys = new Set([...TEMPLATE_VARIABLE_KEYS, ...Object.keys(variables)]);
  const cache = new Map<string, string | undefined>();
  const expand = (input: string): string | undefined => {
    let value = "",
      position = 0;
    for (const token of templateTokens(input, keys)) {
      if (!Object.hasOwn(variables, token.key)) return undefined;
      if (!cache.has(token.key))
        cache.set(token.key, expand(variables[token.key]));
      const resolved = cache.get(token.key);
      if (resolved === undefined) return undefined;
      value += input.slice(position, token.start) + resolved;
      if (value.length > L.templateInput)
        throw new CustomCommandValidationError("Rendered output is too long.");
      position = token.end;
    }
    value += input.slice(position);
    if (value.length > L.templateInput)
      throw new CustomCommandValidationError("Rendered output is too long.");
    return value;
  };
  return (value) => expand(value)?.replace(/^<(?:@!?|#)(\d{17,20})>$/, "$1");
}

export function isEffectAction(
  action: ComponentAction,
): action is EffectAction | SequenceAction {
  return !["go", "back", "main", "cancel"].includes(action.action);
}

export function actionSteps(action: ComponentAction): EffectAction[] {
  return action.action === "sequence"
    ? action.actions
    : isEffectAction(action)
      ? [action]
      : [];
}

export function responseEffects(content: ResponseTemplate[]): EffectAction[] {
  return content.flatMap(responseActions).flatMap(actionSteps);
}

export function responseActions(response: ResponseTemplate): ComponentAction[] {
  return [
    ...(response.buttons ?? []).filter(
      (button): button is Extract<typeof button, { action: string }> =>
        "action" in button,
    ),
    ...(response.selects ?? []).flatMap((select) => select.options),
  ];
}

export function responseRoleIds(content: ResponseTemplate[]): string[] {
  return responseEffects(content).flatMap((action) =>
    "roleId" in action ? [action.roleId] : [],
  );
}

export function responseChannelIds(content: ResponseTemplate[]): string[] {
  const target = staticTargets(content);
  return responseEffects(content).flatMap((action) => {
    const id =
      "channelId" in action && action.channelId
        ? target(action.channelId)
        : undefined;
    return id && /^\d{17,20}$/.test(id) ? [id] : [];
  });
}

export function responseUserIds(
  content: ResponseTemplate[],
  membersOnly = false,
): string[] {
  const target = staticTargets(content);
  return responseEffects(content).flatMap((action) => {
    if (membersOnly && (action.action === "unban" || action.action === "note"))
      return [];
    const id =
      "userId" in action && action.userId ? target(action.userId) : undefined;
    return id && /^\d{17,20}$/.test(id) ? [id] : [];
  });
}

export function responseCategoryIds(content: ResponseTemplate[]): string[] {
  const target = staticTargets(content);
  return responseEffects(content).flatMap((action) => {
    const id =
      action.action === "setchannelcategory" && action.categoryId
        ? target(action.categoryId)
        : undefined;
    return id && /^\d{17,20}$/.test(id) ? [id] : [];
  });
}

export function hasServerActionReferences(
  content: ResponseTemplate[],
): boolean {
  return (
    responseRoleIds(content).length > 0 ||
    responseChannelIds(content).length > 0 ||
    responseCategoryIds(content).length > 0 ||
    responseUserIds(content).length > 0
  );
}
