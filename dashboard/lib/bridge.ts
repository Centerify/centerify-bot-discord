import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function bridge<T = unknown>(
  actorId: string,
  path: string,
  body?: unknown,
  key?: string,
): Promise<T> {
  const secret = process.env.CENTERIFY_DASHBOARD_BRIDGE_SECRET;
  if (!secret || secret.length < 32)
    throw new ApiError(
      503,
      "Configure the dashboard bridge secret and start Centerify to connect this workspace.",
    );
  const origin = new URL(process.env.CENTERIFY_DASHBOARD_BRIDGE_URL ?? "http://127.0.0.1:3010");
  if (!["http:", "https:"].includes(origin.protocol)) throw new ApiError(503, "Invalid bridge URL");
  const timestamp = String(Date.now()),
    nonce = randomUUID(),
    text = body === undefined ? "" : JSON.stringify(body),
    method = body === undefined ? "GET" : "POST";
  const hash = createHash("sha256").update(text).digest("hex");
  const mac = createHmac("sha256", secret)
    .update([timestamp, nonce, actorId, method, path, hash].join("\n"))
    .digest("hex");
  let response: Response;
  try {
    response = await fetch(new URL(path, origin), {
      method,
      body: text || undefined,
      headers: {
        "Content-Type": "application/json",
        "x-centerify-time": timestamp,
        "x-centerify-nonce": nonce,
        "x-centerify-actor": actorId,
        "x-centerify-signature": mac,
        ...(key ? { "idempotency-key": key } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ApiError(
      503,
      "The bot is disconnected. Start Centerify and check the internal bridge connection.",
    );
  }
  const data = await response.json();
  if (!response.ok) throw new ApiError(response.status, data.error ?? "Centerify request failed");
  return data as T;
}
