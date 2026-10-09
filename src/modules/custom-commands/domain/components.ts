import type { ComponentAction, ResponseTemplate } from "./types.js";

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
  return content
    .flatMap(responseActions)
    .flatMap((action) => ("roleId" in action ? [action.roleId] : []));
}
