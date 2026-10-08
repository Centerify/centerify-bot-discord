import { loggerToken } from "../../core/index.js";
import { serviceRef } from "../discord/context.js";
export const logger = serviceRef(loggerToken);
