import type {
  ButtonInteraction,
  ChannelSelectMenuInteraction,
  InteractionEditReplyOptions,
  InteractionUpdateOptions,
  RoleSelectMenuInteraction,
  StringSelectMenuInteraction,
} from "discord.js";

export type SetupScreen =
  | "xp"
  | "main"
  | "welcome"
  | "welcome-variables"
  | "goodbye"
  | "goodbye-variables"
  | "autorole"
  | "logging"
  | "moderation";

export type SetupComponentInteraction =
  | ButtonInteraction<"cached">
  | ChannelSelectMenuInteraction<"cached">
  | RoleSelectMenuInteraction<"cached">
  | StringSelectMenuInteraction<"cached">;

export type SetupView = InteractionUpdateOptions & InteractionEditReplyOptions;
