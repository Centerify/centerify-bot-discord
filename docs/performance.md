# Message processing performance

The message handlers skip custom-command ownership checks unless a message starts with `!`. Overlapping ownership checks share their Discord fetch and database read within the same application. Completed authorization checks are discarded so subsequent events refresh ownership.

XP tracks successful awards in a bounded, 100,000-entry cache, with separate keys for each guild, member, and earning method. It reads the current settings before applying a local cooldown, including changes to amounts, enabled methods, and cooldown duration. Overlapping attempts with the same settings share a write; only the original attempt reports an award. Failed attempts remain retryable. PostgreSQL's conditional upsert enforces persisted cooldowns across processes, restarts, and cache evictions. The single atomic statement runs without a surrounding `BEGIN`/`COMMIT`.

Custom-command caches use a monotonic clock and fixed TTL. Entries expire in insertion order, so a miss removes the expired prefix instead of scanning every cached guild. This amortizes cleanup across misses while preserving the existing size limit, failure eviction, and invalidation behavior. Injected clocks must also be monotonic.

## Local measurements

Measured on Node.js 25.6.1 against revision `5a76ce9`:

| Workload | Before | After |
| --- | --- | --- |
| 30,000 cache misses at 1,000 cached guilds; median of five runs | 178.1 ms | 20.0 ms |
| 1,000 sequential messages within one XP cooldown | 1,000 award writes | 1 award write |
| 100 overlapping ownership checks for one guild | 100 Discord fetches and database reads | 1 Discord fetch and database read |

The cache benchmark is about 8.9 times faster for this workload. The XP benchmark uses simulated 1 ms award-write latency and in-memory settings; it measures avoided writes, not production Discord or database latency. Actual gains depend on activity patterns and I/O latency. Guild configuration reads still happen for every XP event so settings changes take effect immediately.

Run `npm run benchmark:performance` to reproduce the cache and XP comparisons, or pass a different baseline revision with `npm run benchmark:performance -- <revision>`. The benchmark loads the selected historical implementations with the current command constants and XP policy; it makes no database or Discord connections.

Regression tests cover cooldown boundaries, concurrent bursts, failed writes, settings changes, independent earning methods, slow writes, cache eviction, and fresh ownership checks. Live PostgreSQL tests also cover concurrent awards from independent service instances and persisted cooldowns after restart.
