import { DefaultRestOptions, type RESTOptions } from "discord.js";
import { Pool } from "undici";
import type { Logger } from "../../core/index.js";
import { interactionErrorDetails } from "./interactions.js";

/** Reserve warm connections for the three-second initial interaction response. */
export function createInteractionTransport(logger: Logger, origin = "https://discord.com") {
  const callbacks = new Pool(origin, {
    connections: 2,
    pipelining: 1,
    keepAliveTimeout: 60_000,
    keepAliveMaxTimeout: 60_000,
  });
  const lifetime = new AbortController();
  let timer: ReturnType<typeof setInterval> | undefined;
  let warming: Promise<void> | undefined;
  const warm = () =>
    (warming ??= (async () => {
      const results = await Promise.allSettled(
        Array.from({ length: 2 }, async () => {
          const response = await callbacks.request({
            method: "GET",
            path: "/api/v10/gateway",
            signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(10_000)]),
          });
          await response.body.dump();
          if (response.statusCode !== 200)
            throw new Error(`Discord warm-up returned HTTP ${response.statusCode}`);
        }),
      );
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected" && !lifetime.signal.aborted)
        logger.warn(
          interactionErrorDetails(failure.reason),
          "Could not warm Discord interaction connections",
        );
    })().finally(() => {
      warming = undefined;
    }));

  const makeRequest: RESTOptions["makeRequest"] = (url, options) => {
    const parsed = new URL(url);
    const isCallback =
      parsed.origin === origin &&
      /^\/api\/v\d+\/interactions\/[^/]+\/[^/]+\/callback$/.test(parsed.pathname);
    // Keep uploads and other REST traffic on the SDK's normal dispatcher.
    return DefaultRestOptions.makeRequest(
      url,
      isCallback ? { ...options, dispatcher: callbacks } : options,
    );
  };
  return {
    makeRequest,
    async start() {
      await warm();
      if (!lifetime.signal.aborted && !timer) {
        timer = setInterval(() => {
          void warm();
        }, 30_000);
        timer.unref();
      }
    },
    async stop() {
      if (timer) clearInterval(timer);
      lifetime.abort();
      await callbacks.destroy();
      await warming;
    },
  };
}
