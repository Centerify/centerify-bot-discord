import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import type { DashboardService } from "./service.js";
import { DashboardError } from "./contracts.js";
import { BridgeVerifier } from "./security.js";
import { loggerToken } from "../core/index.js";
import { CustomCommandError } from "../modules/custom-commands/domain/errors.js";
import { GuildSettingsError } from "../modules/guilds/domain/settings.js";

export async function startDashboardBridge(service: DashboardService) {
  const secret = process.env.CENTERIFY_DASHBOARD_BRIDGE_SECRET ?? "";
  const verifier = new BridgeVerifier(secret);
  const port = z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .parse(process.env.CENTERIFY_DASHBOARD_BRIDGE_PORT ?? 3010);
  const host = process.env.CENTERIFY_DASHBOARD_BRIDGE_HOST ?? "127.0.0.1";
  const respond = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(body ?? null));
  };
  const server = createServer((req, res) => {
    void (async () => {
      try {
        const method = req.method ?? "GET",
          url = new URL(req.url ?? "/", "http://bridge.internal");
        let body = "",
          bytes = 0;
        for await (const chunk of req) {
          bytes += Buffer.byteLength(chunk);
          if (bytes > 524288) throw new DashboardError(413, "Request exceeds 512KiB");
          body += String(chunk);
        }
        const actor = verifier.verify(req.headers, method, `${url.pathname}${url.search}`, body);
        if (!["GET", "POST"].includes(method)) throw new DashboardError(405, "Method not allowed");
        if (url.pathname === "/v1/health" && method === "GET") {
          if (!service.client.isReady()) throw new DashboardError(503, "Bot disconnected");
          await service.store.database.orm.public.DashboardAccount.first();
          respond(res, 200, { ready: true });
          return;
        }
        if (url.pathname === "/v1/guilds" && method === "GET") {
          respond(res, 200, await service.guilds(actor));
          return;
        }
        if (url.pathname === "/v1/account") {
          respond(res, 200, await service.account(actor, method === "GET" ? {} : JSON.parse(body)));
          return;
        }
        const match = /^\/v1\/guilds\/(\d{17,20})\/(.+)$/.exec(url.pathname);
        if (!match) throw new DashboardError(404, "Endpoint not found");
        if (method === "GET") {
          const data = await service.read(actor, match[1]!, match[2]!, url.searchParams);
          if (match[2] === "events") {
            const value = data as { reset: boolean; events: { data: unknown }[] };
            value.events = value.events.map((e) => ({ ...e, data: null }));
          }
          respond(res, 200, data);
          return;
        }
        const key = z.string().uuid().parse(req.headers["idempotency-key"]);
        respond(res, 200, await service.mutate(actor, match[1]!, match[2]!, JSON.parse(body), key));
      } catch (error) {
        const status =
          error instanceof DashboardError
            ? error.status
            : error instanceof z.ZodError ||
                error instanceof SyntaxError ||
                error instanceof CustomCommandError ||
                error instanceof GuildSettingsError ||
                (error instanceof Error && error.name === "TicketError")
              ? 400
              : 500;
        const message =
          error instanceof DashboardError
            ? error.message
            : error instanceof z.ZodError
              ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
              : status === 400
                ? error instanceof SyntaxError
                  ? "Invalid JSON request"
                  : error instanceof Error
                    ? error.message.slice(0, 1000)
                    : "Invalid input"
                : "Centerify could not complete this request. Check the bot logs and audit trail.";
        // Never log request bodies, bridge headers, OAuth tokens or raw Discord errors.
        if (status === 500)
          service.application
            .resolve(loggerToken)
            .error(
              { operation: "dashboard.request" },
              "Dashboard request failed; inspect the guild audit trail",
            );
        respond(res, status, { error: message });
      }
    })();
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  server.maxRequestsPerSocket = 100;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        service.stop();
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
      }),
  };
}
