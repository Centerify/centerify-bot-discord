import { NextRequest } from "next/server";
import { identity } from "@/lib/session";
import { bridge, ApiError } from "@/lib/bridge";
import { demoState, demoRead } from "@/lib/demo";
import type { Event } from "@/lib/types";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    await identity(req);
    const guildId = z
      .string()
      .regex(/^\d{17,20}$/)
      .parse(req.nextUrl.searchParams.get("guildId"));
    let cursor = z.coerce
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .parse(req.headers.get("last-event-id") ?? req.nextUrl.searchParams.get("cursor") ?? 0);
    let timer: ReturnType<typeof setTimeout> | undefined,
      closed = false;
    const encoder = new TextEncoder(),
      started = Date.now();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (text: string) => {
          if (!closed) controller.enqueue(encoder.encode(text));
        };
        const close = () => {
          if (!closed) {
            closed = true;
            clearTimeout(timer);
            controller.close();
          }
        };
        req.signal.addEventListener("abort", close, { once: true });
        const poll = async () => {
          if (closed) return;
          try {
            const user = await identity(req);
            const query = new URLSearchParams({ cursor: String(cursor) });
            const data = (
              user.demo
                ? demoRead(
                    demoState(req.cookies.get("centerify-demo")!.value),
                    guildId,
                    "events",
                    query,
                  )
                : await bridge(user.id, `/v1/guilds/${guildId}/events?${query}`)
            ) as { reset: boolean; events: Event[] };
            if (data.reset) send("event: reset\ndata: {}\n\n");
            for (const event of data.events) {
              if (event.id <= cursor) continue;
              cursor = event.id;
              send(`id: ${event.id}\nevent: update\ndata: ${JSON.stringify(event)}\n\n`);
            }
            send(": heartbeat\n\n");
            if (Date.now() - started > 50000) {
              close();
              return;
            }
            timer = setTimeout(() => void poll(), 3000);
          } catch (error) {
            send(
              `event: ${error instanceof ApiError && (error.status === 401 || error.status === 403) ? "expired" : "disconnected"}\ndata: {}\n\n`,
            );
            close();
          }
        };
        send("retry: 3000\n\n");
        void poll();
      },
      cancel() {
        closed = true;
        clearTimeout(timer);
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof ApiError ? error.message : "Invalid subscription" },
      { status: error instanceof ApiError ? error.status : 400 },
    );
  }
}
