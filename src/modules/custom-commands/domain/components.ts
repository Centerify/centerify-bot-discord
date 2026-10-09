import type {
  ComponentAction,
  EffectAction,
  ResponseTemplate,
  SequenceAction,
} from "./types.js";

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
    /^\d{17,20}$/.test(action.channelId)
      ? [action.channelId]
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
    /^\d{17,20}$/.test(action.userId)
      ? [action.userId]
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
