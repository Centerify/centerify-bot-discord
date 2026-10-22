import { NextRequest, NextResponse } from "next/server";
import { identity, sameOrigin } from "@/lib/session";
import { bridge, ApiError } from "@/lib/bridge";
import { demoState, demoRead, demoMutate } from "@/lib/demo";
import { z } from "zod";
import { DashboardError } from "../../../../../../src/dashboard/contracts";
import { CustomCommandError } from "../../../../../../src/modules/custom-commands/domain/errors";
type Context = { params: Promise<{ guildId: string; resource: string[] }> };
const allowed = new Set([
  "moderation",
  "ticket-profiles",
  "overview",
  "members",
  "cases",
  "reports",
  "bans",
  "tickets",
  "commands",
  "settings",
  "resources",
  "workflows",
  "plugins",
  "xp",
  "audit",
]);
async function route(req: NextRequest, context: Context, mutation: boolean) {
  try {
    if (mutation) sameOrigin(req);
    const user = await identity(req),
      params = await context.params;
    const guildId = z
      .string()
      .regex(/^\d{17,20}$/)
      .parse(params.guildId);
    if (
      !allowed.has(params.resource[0]!) ||
      params.resource.length > 2 ||
      (params.resource[1] && !/^\d{17,20}$/.test(params.resource[1]))
    )
      throw new ApiError(404, "Endpoint not found");
    const resource = params.resource.join("/");
    let body: unknown, key: string | undefined;
    if (mutation) {
      key = z.string().uuid().parse(req.headers.get("idempotency-key"));
      const text = await req.text();
      if (Buffer.byteLength(text) > 524288) throw new ApiError(413, "Request exceeds 512KiB");
      body = JSON.parse(text);
    }
    const path = `/v1/guilds/${guildId}/${resource}${req.nextUrl.search}`;
    const data = user.demo
      ? mutation
        ? await demoMutate(
            demoState(req.cookies.get("centerify-demo")!.value),
            guildId,
            resource,
            body,
            key!,
          )
        : demoRead(
            demoState(req.cookies.get("centerify-demo")!.value),
            guildId,
            resource,
            req.nextUrl.searchParams,
          )
      : await bridge(user.id, path, body, key);
    return NextResponse.json(data ?? null, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status =
      error instanceof ApiError || error instanceof DashboardError
        ? error.status
        : error instanceof z.ZodError ||
            error instanceof SyntaxError ||
            error instanceof CustomCommandError
          ? 400
          : 500;
    return NextResponse.json(
      {
        error:
          error instanceof ApiError ||
          error instanceof DashboardError ||
          error instanceof CustomCommandError
            ? error.message
            : error instanceof z.ZodError
              ? error.issues.map((i) => i.message).join("; ")
              : status === 400
                ? "Invalid request"
                : "The operation could not finish. Check the audit log before retrying.",
      },
      { status },
    );
  }
}
export const GET = (req: NextRequest, context: Context) => route(req, context, false);
export const POST = (req: NextRequest, context: Context) => route(req, context, true);
