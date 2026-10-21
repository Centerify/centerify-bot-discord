import { currentApplication } from "../../../adapters/discord/context.js";
import { customCommandOptionsToken } from "../index.js";

export function customCommandPrefix() {
  return currentApplication().resolve(customCommandOptionsToken).prefix;
}
