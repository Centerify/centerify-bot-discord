import { serviceToken } from "../container.js";

export interface Logger {
  info(fields: object | string, message?: string): void;
  warn(fields: object | string, message?: string): void;
  error(fields: object | string, message?: string): void;
}

export const loggerToken = serviceToken<Logger>("logger");
export const silentLogger: Logger = { info() {}, warn() {}, error() {} };
