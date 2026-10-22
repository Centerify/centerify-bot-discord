import "server-only";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { ApiError } from "./bridge";
export const demoEnabled = () => process.env.CENTERIFY_DASHBOARD_DEMO === "true";
export async function identity(req: NextRequest) {
  if (demoEnabled() && req.cookies.get("centerify-demo")?.value)
    return { id: "111111111111111111", name: "Alex Morgan", demo: true, accessToken: "" };
  const secure = new URL(process.env.AUTH_URL ?? req.url).protocol === "https:";
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET ?? "",
    secureCookie: secure,
  });
  if (
    !token?.sub ||
    !/^\d{17,20}$/.test(token.sub) ||
    Number(token.discordExpiresAt) * 1000 <= Date.now()
  )
    throw new ApiError(401, "Your Discord session expired. Sign in again to continue.");
  return {
    id: token.sub,
    name: String(token.name ?? "Discord member"),
    demo: false,
    accessToken: String(token.discordAccessToken ?? ""),
  };
}
export function sameOrigin(req: NextRequest) {
  const expected = new URL(process.env.AUTH_URL ?? req.url).origin;
  if (req.headers.get("origin") !== expected || req.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(403, "This request must originate from the dashboard");
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new ApiError(415, "Use application/json");
}
