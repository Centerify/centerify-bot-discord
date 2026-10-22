"use client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ComponentProps } from "react";
export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuSeparator = DropdownMenu.Separator;
export function MenuContent(props: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content sideOffset={8} className="menu-content" {...props} />
    </DropdownMenu.Portal>
  );
}
export function MenuItem(props: ComponentProps<typeof DropdownMenu.Item>) {
  return <DropdownMenu.Item className="menu-item" {...props} />;
}
