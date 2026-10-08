import { serviceRef } from "../../../adapters/discord/context.js";
import { legacyResponsesToken } from "../index.js";
export type { CustomResponse, CustomResponseKind } from "../index.js";
export const customResponseService = serviceRef(legacyResponsesToken);
