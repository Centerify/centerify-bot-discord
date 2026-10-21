import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { CustomCommandCache } from "../src/modules/custom-commands/application/CustomCommandCache.js";
import { XpService, type XpRepository } from "../src/modules/xp/index.js";
import type { GuildConfig, GuildConfigStore } from "../src/modules/guilds/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const revision = process.argv[2] ?? "5a76ce9";

async function baseline(file: string) {
  const source = execFileSync("git", ["show", `${revision}:${file}`], {
    cwd: root,
    encoding: "utf8",
  })
    .replace(
      "../domain/constants.js",
      pathToFileURL(`${root}src/modules/custom-commands/domain/constants.ts`).href,
    )
    .replace("../domain/policy.js", pathToFileURL(`${root}src/modules/xp/domain/policy.ts`).href);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

async function cacheRun(Cache: typeof CustomCommandCache) {
  const cache = new Cache(30_000, 1000, () => 0);
  const load = async () => 1;
  for (let i = 0; i < 1000; i++) await cache.get(String(i), load);
  const started = performance.now();
  for (let i = 1000; i < 31_000; i++) await cache.get(String(i), load);
  return performance.now() - started;
}

async function xpRun(Service: typeof XpService) {
  let writes = 0;
  const repository: XpRepository = {
    async award() {
      writes++;
      await delay(1);
      return writes === 1;
    },
    async sharingConfigurations() {
      return [];
    },
    async totals() {
      return [];
    },
  };
  const config: Pick<GuildConfigStore, "getOrCreate"> = {
    async getOrCreate() {
      return {
        xpEnabled: true,
        xpMethods: "messages",
        xpMessageAmount: 15,
        xpCooldownSeconds: 60,
      } as GuildConfig;
    },
  };
  const service = new Service(repository, config);
  const started = performance.now();
  for (let i = 0; i < 1000; i++) await service.award("guild", "member");
  return { writes, ms: performance.now() - started };
}

const { CustomCommandCache: PreviousCache } = await baseline(
  "src/modules/custom-commands/application/CustomCommandCache.ts",
);
const { XpService: PreviousXp } = await baseline("src/modules/xp/application/XpService.ts");
await cacheRun(PreviousCache);
await cacheRun(CustomCommandCache);
const previous: number[] = [],
  current: number[] = [];
for (let run = 0; run < 5; run++) {
  previous.push(await cacheRun(PreviousCache));
  current.push(await cacheRun(CustomCommandCache));
}
const median = (values: number[]) => [...values].sort((a, b) => a - b)[2]!;
console.log(
  JSON.stringify({
    benchmark: "30,000 cache misses at 1,000-guild capacity, median of 5",
    revision,
    beforeMs: median(previous),
    afterMs: median(current),
    speedup: median(previous) / median(current),
  }),
);
console.log(
  JSON.stringify({
    benchmark: "1,000 messages within one cooldown, simulated 1ms award write",
    revision,
    before: await xpRun(PreviousXp),
    after: await xpRun(XpService),
  }),
);
