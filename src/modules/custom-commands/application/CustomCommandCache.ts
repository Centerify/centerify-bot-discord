import { CUSTOM_COMMAND_LIMITS as L } from "../domain/constants.js";
interface Entry<T> {
  expiresAt: number;
  promise: Promise<T>;
}
/** Bounded TTL cache with coalesced reads. Invalidating a pending read cannot repopulate it. */
export class CustomCommandCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  public constructor(
    private readonly ttlMs: number = L.cacheTtlMs,
    private readonly maxEntries: number = L.cacheGuilds,
    private readonly now: () => number = Date.now,
  ) {}
  public invalidate(guildId: string): void {
    this.entries.delete(guildId);
  }
  public clear(): void {
    this.entries.clear();
  }
  public get size(): number {
    return this.entries.size;
  }
  public get(guildId: string, load: () => Promise<T>): Promise<T> {
    const now = this.now();
    const hit = this.entries.get(guildId);
    if (hit && hit.expiresAt > now) return hit.promise;
    for (const [id, entry] of this.entries)
      if (entry.expiresAt <= now) this.entries.delete(id);
    if (this.entries.size >= this.maxEntries)
      this.entries.delete(this.entries.keys().next().value!);
    const entry: Entry<T> = {
      expiresAt: now + this.ttlMs,
      promise: Promise.resolve().then(load),
    };
    this.entries.set(guildId, entry);
    entry.promise.catch(() => {
      if (this.entries.get(guildId) === entry) this.entries.delete(guildId);
    });
    return entry.promise;
  }
}
