import { CUSTOM_COMMAND_LIMITS as L } from "../../lib/customCommands/constants.js";
import {
  CustomCommandCooldownError,
  CustomCommandLimitError,
} from "../../lib/customCommands/errors.js";
import type { CustomCommandExecutionContext } from "../../lib/customCommands/types.js";
interface Reservation {
  until: number;
  token: symbol;
}
export interface CustomCommandCooldownStore {
  acquire(context: CustomCommandExecutionContext): () => void;
}
export class CustomCommandCooldownService implements CustomCommandCooldownStore {
  private readonly entries = new Map<string, Reservation>();
  private lastSweep = 0;
  public constructor(
    private readonly now: () => number = Date.now,
    private readonly maxEntries: number = L.cooldownEntries,
  ) {}
  public get size(): number {
    return this.entries.size;
  }
  public sweep(): void {
    const now = this.now();
    for (const [key, entry] of this.entries)
      if (entry.until <= now) this.entries.delete(key);
    this.lastSweep = now;
  }
  public acquire(context: CustomCommandExecutionContext): () => void {
    const { command, guildId, userId, channelId } = context;
    if (!command.cooldownSeconds) return () => {};
    const now = this.now();
    if (
      now - this.lastSweep >= L.cooldownSweepMs ||
      this.entries.size >= this.maxEntries
    )
      this.sweep();
    // Keep a shared command's source identity across servers. GLOBAL_COMMAND
    // spans servers and trigger sources; GUILD still uses the invocation server.
    const scopes = {
      USER: userId,
      CHANNEL: channelId,
      GUILD: guildId,
      GLOBAL_COMMAND: String(command.id),
    };
    const key = `${command.sourceGuildId ?? guildId}:${command.id}:${command.cooldownScope}:${scopes[command.cooldownScope]}`;
    const existing = this.entries.get(key);
    if (existing && existing.until > now)
      throw new CustomCommandCooldownError(
        Math.ceil((existing.until - now) / 1000),
      );
    if (!existing && this.entries.size >= this.maxEntries)
      throw new CustomCommandLimitError(
        "Command cooldown capacity reached. Try again shortly.",
      );
    const reservation = {
      until: now + command.cooldownSeconds * 1000,
      token: Symbol(),
    };
    this.entries.set(key, reservation);
    return () => {
      if (this.entries.get(key)?.token === reservation.token)
        this.entries.delete(key);
    };
  }
}
