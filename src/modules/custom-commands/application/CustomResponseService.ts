import { LegacyNameConflict } from "../domain/legacy.js";
import { CustomCommandCache } from "./CustomCommandCache.js";
import { PROTECTED_COMMAND_NAMES } from "../domain/constants.js";
import type { CustomResponse, CustomResponseKind, LegacyResponseRepository } from "../domain/legacy.js";
export type { CustomResponse, CustomResponseKind } from "../domain/legacy.js";

const namePattern = /^[a-z0-9_-]{1,32}$/;
const triggerPattern = /^[a-z0-9_-]{1,32}$/;
const kinds = new Set<CustomResponseKind>(["command", "member_join", "member_leave"]);

export class CustomResponseService {
  constructor(private readonly repository: LegacyResponseRepository, private readonly isBuiltInCommand: (name: string) => boolean = (name) => PROTECTED_COMMAND_NAMES.some((entry) => entry === name), private readonly maxRules = 25) {}
  private readonly cache = new CustomCommandCache<CustomResponse[]>();
  public listCached(guildId: string): Promise<CustomResponse[]> {
    return this.cache.get(guildId, async () => await this.list(guildId));
  }
  public list(guildId: string) {
    return this.repository.list(guildId);
  }

  public find(guildId: string, name: string) {
    return this.repository.find(guildId, name);
  }

  public async create(input: {
    guildId: string;
    name: string;
    kind: CustomResponseKind;
    trigger: string;
    response: string;
    channelId: string | null;
    allowedRoleId: string | null;
    adminOnly: boolean;
    exactMatch: boolean;
    embed: boolean;
    cooldownSeconds: number;
    createdBy: string;
  }) {
    if (!namePattern.test(input.name)) throw new Error("Name must be 1–32 lowercase letters, numbers, hyphens, or underscores.");
    if (!kinds.has(input.kind)) throw new Error("Kind must be command, member_join, or member_leave.");
    if (input.kind === "command" && !triggerPattern.test(input.trigger)) throw new Error("Command trigger must be 1–32 lowercase letters, numbers, hyphens, or underscores.");
    if (input.kind !== "command" && !input.channelId) throw new Error("Join and leave events need an output channel.");
    if (!input.response.trim() || input.response.length > 1800) throw new Error("Response must be 1–1800 characters.");
    if (!Number.isInteger(input.cooldownSeconds) || input.cooldownSeconds < 0 || input.cooldownSeconds > 3600) throw new Error("Cooldown must be 0–3600 seconds.");
    if (this.isBuiltInCommand(input.name) || (input.kind === "command" && this.isBuiltInCommand(input.trigger))) throw new Error("That command name is reserved by a built-in command.");
    try {
      const created = await this.repository.mutate(input.guildId, async (tx) => {
        const modernNames = await tx.modernNames();
        if (modernNames.some(entry => entry === input.name || (input.kind === "command" && entry === input.trigger))) throw new Error("That command name or trigger is already in use.");
        const rules = await tx.list();
        if (rules.length >= this.maxRules) throw new Error(`This server can have at most ${this.maxRules} custom responses.`);
        if (rules.some((rule) => rule.name === input.name)) throw new Error("A response with that name already exists.");
        if (input.kind === "command" && rules.some((rule) => rule.kind === "command" && rule.trigger === input.trigger)) throw new Error("That command trigger is already in use.");
        return tx.create(input);
      });
      this.cache.invalidate(input.guildId);
      return created;
    } catch (error) {
      if (error instanceof LegacyNameConflict) {
        throw new Error("A response with that name already exists.");
      }
      throw error;
    }
  }

  public async remove(guildId: string, name: string) {
    const rule = await this.find(guildId, name);
    if (!rule) return false;
    await this.repository.remove(guildId, name);
    this.cache.invalidate(guildId);
    return true;
  }

  public async setEnabled(guildId: string, name: string, enabled: boolean) {
    const rule = await this.find(guildId, name);
    if (!rule) return false;
    await this.repository.update(guildId, name, { enabled });
    this.cache.invalidate(guildId);
    return true;
  }

  public async setResponse(guildId: string, name: string, response: string) {
    if (!response.trim() || response.length > 1800) throw new Error("Response must be 1–1800 characters.");
    const rule = await this.find(guildId, name);
    if (!rule) return false;
    await this.repository.update(guildId, name, { response });
    this.cache.invalidate(guildId);
    return true;
  }

}
