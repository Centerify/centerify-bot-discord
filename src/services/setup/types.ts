import type {
  ButtonInteraction,
  ChannelSelectMenuInteraction,
  InteractionEditReplyOptions,
  InteractionUpdateOptions,
  RoleSelectMenuInteraction,
} from "discord.js";

export type SetupScreen =
  | "main"
  | "welcome"
  | "welcome-variables"
  | "goodbye"
  | "goodbye-variables"
  | "autorole"
  | "logging";

export type SetupComponentInteraction =
  | ButtonInteraction<"cached">
  | ChannelSelectMenuInteraction<"cached">
  | RoleSelectMenuInteraction<"cached">;

export type SetupView = InteractionUpdateOptions & InteractionEditReplyOptions;
