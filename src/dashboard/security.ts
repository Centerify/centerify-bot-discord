import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { DashboardError } from "./contracts.js";

export function signature(
  secret: string,
  timestamp: string,
  nonce: string,
  actor: string,
  method: string,
  path: string,
  body: string,
) {
  const hash = createHash("sha256").update(body).digest("hex");
  return createHmac("sha256", secret)
    .update([timestamp, nonce, actor, method, path, hash].join("\n"))
    .digest("hex");
}
export class BridgeVerifier {
  private readonly seen = new Map<string, number>();
  constructor(
    private readonly secret: string,
    private readonly now = Date.now,
  ) {
    if (secret.length < 32)
      throw new Error("Dashboard bridge secret must be at least 32 characters");
  }
  verify(
    headers: Record<string, string | string[] | undefined>,
    method: string,
    path: string,
    body: string,
  ) {
    const read = (key: string) =>
      typeof headers[key] === "string" ? (headers[key] as string) : "";
    const timestamp = read("x-centerify-time"),
      nonce = read("x-centerify-nonce"),
      actor = read("x-centerify-actor"),
      mac = read("x-centerify-signature");
    const now = this.now();
    for (const [id, expiry] of this.seen) if (expiry < now) this.seen.delete(id);
    if (
      !/^\d{17,20}$/.test(actor) ||
      !/^[a-f0-9-]{36}$/.test(nonce) ||
      !/^\d{13}$/.test(timestamp) ||
      Math.abs(now - Number(timestamp)) > 30_000 ||
      this.seen.has(nonce) ||
      !/^[a-f0-9]{64}$/.test(mac)
    )
      throw new DashboardError(401, "Invalid bridge authentication");
    const expected = signature(this.secret, timestamp, nonce, actor, method, path, body);
    if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected)))
      throw new DashboardError(401, "Invalid bridge authentication");
    this.seen.set(nonce, now + 60_000);
    if (this.seen.size > 20000) throw new DashboardError(429, "Bridge capacity exceeded");
    return actor;
  }
}
export function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function eventOperationKey(identity: string) {
  const hex = createHash("sha256").update(identity).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}
export function requireCapability(capabilities: readonly string[], needed: string) {
  if (!capabilities.includes(needed))
    throw new DashboardError(
      403,
      `This operation requires ${needed} access. Check your Discord permissions and server roles.`,
    );
}
export function recoveryEvents<T extends { id: number }>(
  events: T[],
  cursor: number,
  oldest: number | undefined,
) {
  return {
    reset: cursor > 0 && oldest !== undefined && cursor < oldest - 1,
    events: events.filter((event) => event.id > cursor),
  };
}
