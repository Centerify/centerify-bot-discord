import type {
  ComponentAction,
  EffectAction,
  ResponseTemplate,
  SequenceAction,
} from "./types.js";
import { customVariables } from "./variables.js";
import { CUSTOM_COMMAND_LIMITS as L } from "./constants.js";
import { CustomCommandValidationError } from "./errors.js";

function staticTarget(value: string, content: ResponseTemplate[]): string {
  const variables = customVariables(content);
  const cache = new Map<string, string>();
  const expand = (input: string): string => {
    const value = input.replace(
      /\{([A-Z][A-Z0-9_]*)\}/g,
      (token, key: string) => {
        if (!Object.hasOwn(variables, key)) return token;
        if (!cache.has(key)) cache.set(key, expand(variables[key]));
        return cache.get(key)!;
      },
    );
    if (value.length > L.templateInput)
      throw new CustomCommandValidationError("Rendered output is too long.");
    return value;
  };
  return expand(value).replace(/^<(?:@!?|#)(\d{17,20})>$/, "$1");
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
  return responseEffects(content).flatMap((action) =>
    "channelId" in action &&
    action.channelId &&
    /^\d{17,20}$/.test(staticTarget(action.channelId, content))
      ? [staticTarget(action.channelId, content)]
      : [],
  );
}

export function responseUserIds(
  content: ResponseTemplate[],
  membersOnly = false,
): string[] {
  return responseEffects(content).flatMap((action) =>
    (!membersOnly || (action.action !== "unban" && action.action !== "note")) &&
    "userId" in action &&
    action.userId &&
    /^\d{17,20}$/.test(staticTarget(action.userId, content))
      ? [staticTarget(action.userId, content)]
      : [],
  );
}

export function hasServerActionReferences(
  content: ResponseTemplate[],
): boolean {
  return (
    responseRoleIds(content).length > 0 ||
    responseChannelIds(content).length > 0 ||
    responseUserIds(content).length > 0
  );
}
