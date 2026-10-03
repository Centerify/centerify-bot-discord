import { CustomCommandCache } from "./customCommands/CustomCommandCache.js";
import { isBuiltInCommand } from "./customCommands/reservedNames.js";
import { db } from "../prisma/db.js";

export type CustomResponseKind = "command" | "member_join" | "member_leave";
export type CustomResponse = Awaited<ReturnType<typeof customResponseService.list>>[number];

const namePattern = /^[a-z0-9_-]{1,32}$/;
const triggerPattern = /^[a-z0-9_-]{1,32}$/;
const maxRules = 25;
const kinds = new Set<CustomResponseKind>(["command", "member_join", "member_leave"]);

export class CustomResponseService {
  private readonly cache = new CustomCommandCache<CustomResponse[]>();
  public listCached(guildId: string): Promise<CustomResponse[]> {
    return this.cache.get(guildId, async () => await this.list(guildId));
  }
  public list(guildId: string) {
    return db.orm.public.CustomResponse.where({ guildId }).all();
  }

  public find(guildId: string, name: string) {
    return db.orm.public.CustomResponse.where({ guildId, name }).first();
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
    if (isBuiltInCommand(input.name) || (input.kind === "command" && isBuiltInCommand(input.trigger))) throw new Error("That command name is reserved by a built-in command.");
    try {
      const created = await db.transaction(async (tx) => {
        // Serialize creation for this server across bot processes. The transaction
        // releases the lock on commit/rollback; other servers use different keys.
        await tx.query(db.raw.sql`
          SELECT 1 AS locked
          FROM pg_advisory_xact_lock(hashtextextended(${`centerify:custom-responses:${input.guildId}`}, 0))
        `.returnsRow({ locked: "pg/int4@1" }).build());
        const modernNames = await tx.orm.public.CustomCommandName.where({ guildId: input.guildId }).all();
        if (modernNames.some(entry => entry.name === input.name || (input.kind === "command" && entry.name === input.trigger))) throw new Error("That command name or trigger is already in use.");
        const rules = await tx.orm.public.CustomResponse.where({ guildId: input.guildId }).all();
        if (rules.length >= maxRules) throw new Error(`This server can have at most ${maxRules} custom responses.`);
        if (rules.some((rule) => rule.name === input.name)) throw new Error("A response with that name already exists.");
        if (input.kind === "command" && rules.some((rule) => rule.kind === "command" && rule.trigger === input.trigger)) throw new Error("That command trigger is already in use.");
        return tx.orm.public.CustomResponse.create(input);
      });
      this.cache.invalidate(input.guildId);
      return created;
    } catch (error) {
      if (this.isNameConflict(error)) {
        throw new Error("A response with that name already exists.");
      }
      throw error;
    }
  }

  public async remove(guildId: string, name: string) {
    const rule = await this.find(guildId, name);
    if (!rule) return false;
    await db.orm.public.CustomResponse.where({ guildId, name }).delete();
    this.cache.invalidate(guildId);
    return true;
  }

  public async setEnabled(guildId: string, name: string, enabled: boolean) {
    const rule = await this.find(guildId, name);
    if (!rule) return false;
    await db.orm.public.CustomResponse.where({ guildId, name }).update({ enabled });
    this.cache.invalidate(guildId);
    return true;
  }

  public async setResponse(guildId: string, name: string, response: string) {
    if (!response.trim() || response.length > 1800) throw new Error("Response must be 1–1800 characters.");
    const rule = await this.find(guildId, name);
    if (!rule) return false;
    await db.orm.public.CustomResponse.where({ guildId, name }).update({ response });
    this.cache.invalidate(guildId);
    return true;
  }

  private isNameConflict(error: unknown) {
    return Boolean(
      error &&
      typeof error === "object" &&
      "sqlState" in error &&
      "constraint" in error &&
      error.sqlState === "23505" &&
      error.constraint === "custom_response_guildId_name_key",
    );
  }
}

export const customResponseService = new CustomResponseService();
