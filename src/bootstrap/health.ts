import { createServer } from "node:http";

/** Local readiness endpoint. Share a pending check so outages cannot queue database work. */
export async function startHealthServer(
  port: number,
  check: () => Promise<boolean>,
  timeoutMs = 2000,
) {
  let pending: Promise<boolean> | undefined;
  const server = createServer(async (request, response) => {
    if (request.method !== "GET" || request.url !== "/healthz") {
      response.writeHead(404).end();
      return;
    }
    pending ??= Promise.resolve()
      .then(check)
      .catch(() => false)
      .finally(() => {
        pending = undefined;
      });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const ready = await Promise.race([
        pending,
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), timeoutMs);
        }),
      ]);
      response.writeHead(ready ? 200 : 503, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify({ status: ready ? "ok" : "unavailable" }));
    } finally {
      clearTimeout(timer);
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return {
    port: (server.address() as import("node:net").AddressInfo).port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
