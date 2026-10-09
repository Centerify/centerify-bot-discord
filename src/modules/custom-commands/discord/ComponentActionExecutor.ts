import { PermissionFlagsBits, type GuildMember } from "discord.js";
import type {
  EffectAction,
  SequenceAction,
  CustomCommandRecord,
} from "../domain/types.js";
import type { CustomCommandExecutionContext } from "./types.js";
import { actionSteps } from "../domain/components.js";
import { CUSTOM_COMMAND_LIMITS as L } from "../domain/constants.js";
import {
  CustomCommandError,
  CustomCommandPermissionError,
} from "../domain/errors.js";
import { authorizeComponentAction } from "./actionAuthorization.js";
import { renderComponentAction } from "./actionTemplates.js";
import { prepareRoleAction } from "./roleActions.js";
import type { ModerationCases, WarnMember } from "../../moderation/index.js";
import {
  moderationCaseService,
  warnMember,
  validateMemberAction,
  toAuditLogReason,
  getWarnRoleName,
  scheduleWarningRoleRemoval,
  cancelWarningRoleRemoval,
  removeWarningRoleIfUnused,
} from "../../moderation/discord/index.js";

export interface ComponentActionServices {
  cases: Pick<ModerationCases, "createCase" | "revokeActiveWarning">;
  warnings: Pick<WarnMember, "execute">;
  scheduleWarning: typeof scheduleWarningRoleRemoval;
  cancelWarning: typeof cancelWarningRoleRemoval;
  removeWarningRole: typeof removeWarningRoleIfUnused;
}

export class ComponentActionExecutionError extends CustomCommandError {
  constructor(
    public readonly completed: number,
    public readonly total: number,
    public readonly attempted: boolean,
    cause: unknown,
  ) {
    super(
      `${completed}/${total} actions completed. ${cause instanceof CustomCommandError ? cause.message : "The action could not finish. Run the command again before retrying."}`,
    );
    this.cause = cause;
  }
}

/** Validated, bounded workflows; templates supply data, never executable code. */
export class ComponentActionExecutor {
  constructor(
    private readonly services: ComponentActionServices = {
      cases: moderationCaseService,
      warnings: warnMember,
      scheduleWarning: scheduleWarningRoleRemoval,
      cancelWarning: cancelWarningRoleRemoval,
      removeWarningRole: removeWarningRoleIfUnused,
    },
  ) {}

  async execute(
    context: CustomCommandExecutionContext,
    action: EffectAction | SequenceAction,
    loadCommand: () => Promise<CustomCommandRecord | undefined>,
    isActive: () => boolean,
    onAttempt: () => void = () => {},
  ): Promise<string> {
    const authorized = await authorizeComponentAction(context, loadCommand);
    this.requireActive(isActive);
    const rendered = (await renderComponentAction(
      action,
      authorized.context,
    )) as EffectAction | SequenceAction;
    const steps = actionSteps(rendered);
    // Prepare every step first. A malformed or unauthorized later step applies nothing.
    for (const step of steps)
      await this.prepare(authorized.context, authorized.me, step, isActive);
    let completed = 0;
    let attempted = false;
    let result = "";
    try {
      for (const step of steps) {
        this.requireActive(isActive);
        // Earlier steps can change roles, permissions or membership.
        const current = await authorizeComponentAction(context, loadCommand);
        const apply = await this.prepare(
          current.context,
          current.me,
          step,
          isActive,
        );
        this.requireActive(isActive);
        onAttempt();
        attempted = true;
        const message = await apply();
        result = step.successMessage ?? message;
        completed++;
      }
    } catch (error) {
      throw new ComponentActionExecutionError(
        completed,
        steps.length,
        attempted,
        error,
      );
    }
    if (rendered.successMessage !== undefined) return rendered.successMessage;
    if (steps.length === 1) return result;
    const prefix = `${completed} actions completed. `;
    if (prefix.length + result.length <= L.text) return prefix + result;
    // Preserve both Discord's text limit and complete Unicode characters.
    let detail = "";
    for (const character of result) {
      if (prefix.length + detail.length + character.length + 1 > L.text) break;
      detail += character;
    }
    return `${prefix}${detail}…`;
  }

  private requireActive(isActive: () => boolean) {
    if (!isActive())
      throw new CustomCommandPermissionError(
        "These controls have expired. Run the command again.",
      );
  }

  private async prepare(
    context: CustomCommandExecutionContext,
    me: GuildMember,
    action: EffectAction,
    isActive: () => boolean,
  ): Promise<() => Promise<string>> {
    const deny = (message: string): never => {
      throw new CustomCommandPermissionError(message);
    };
    if ("roleId" in action) return prepareRoleAction(context, me, action);
    if (action.action === "reply") return async () => action.text;
    if (action.action === "sendmessage") {
      const channel =
        action.channelId === undefined || action.channelId === context.channelId
          ? context.channel
          : await context.guild.channels.fetch(action.channelId, {
              force: true,
            });
      if (
        !channel ||
        channel.guildId !== context.guildId ||
        !channel.isTextBased() ||
        !("send" in channel)
      )
        return deny("Choose a text channel in this server.");
      const permissions = [
        PermissionFlagsBits.ViewChannel,
        channel.isThread()
          ? PermissionFlagsBits.SendMessagesInThreads
          : PermissionFlagsBits.SendMessages,
      ];
      if (
        !channel.permissionsFor(context.member)?.has(permissions) ||
        !channel.permissionsFor(me)?.has(permissions)
      )
        deny(
          "You and I both need permission to view and send messages in the target channel.",
        );
      return async () => {
        await channel.send({
          content: action.text,
          allowedMentions: {
            parse: [],
            users: [context.userId],
            roles: [],
            repliedUser: false,
          },
        });
        return "Message sent.";
      };
    }
    const permission =
      action.action === "kick"
        ? PermissionFlagsBits.KickMembers
        : action.action === "ban" || action.action === "unban"
          ? PermissionFlagsBits.BanMembers
          : action.action === "setnickname"
            ? action.userId === context.userId
              ? PermissionFlagsBits.ChangeNickname
              : PermissionFlagsBits.ManageNicknames
            : PermissionFlagsBits.ModerateMembers;
    if (!context.member.permissions.has(permission))
      deny("You lack the Discord permission required for this action.");
    const botPermission =
      action.action === "warn" || action.action === "unwarn"
        ? PermissionFlagsBits.ManageRoles
        : action.action === "setnickname"
          ? PermissionFlagsBits.ManageNicknames
          : permission;
    if (action.action !== "note" && !me.permissions.has(botPermission))
      deny("I lack the Discord permission required for this action.");
    if (action.userId === context.guild.ownerId && action.action !== "note")
      deny("I cannot moderate the server owner.");
    if (
      action.userId === context.userId &&
      action.action !== "note" &&
      action.action !== "setnickname"
    )
      deny("You cannot moderate yourself.");
    const reason =
      "reason" in action
        ? action.reason.trim()
        : `Custom command ${context.command.name}: nickname change requested by ${context.userId}`;
    const audit = toAuditLogReason(
      `${reason} [custom ${context.command.id}; actor ${context.userId}]`,
    );
    const caseInput = {
      guildId: context.guildId,
      targetUserId: action.userId,
      moderatorUserId: context.userId,
      reason,
      metadata: {
        customCommandId: context.command.id,
        customCommandName: context.command.name,
      },
    };
    if (action.action === "note") {
      // Moderator notes can refer to former members, as in /note add.
      await context.guild.client.users.fetch(action.userId, { force: true });
      return async () => {
        const created = await this.services.cases.createCase({
          ...caseInput,
          action: "NOTE",
        });
        return `Note added — Case #${created.caseNumber}.`;
      };
    }
    if (action.action === "unban") {
      if (action.userId === me.id) deny("I cannot moderate myself.");
      // A ban must actually exist before beginning a workflow.
      await context.guild.bans.fetch(action.userId);
      return async () => {
        await context.guild.members.unban(action.userId, audit);
        const created = await this.services.cases.createCase({
          ...caseInput,
          action: "UNBAN",
        });
        return `Ban removed — Case #${created.caseNumber}.`;
      };
    }
    const member = await context.guild.members.fetch({
      user: action.userId,
      force: true,
    });
    if (member.guild.id !== context.guildId || member.id !== action.userId)
      deny("That member belongs to another server.");
    if (action.action === "setnickname" && member.id === context.userId) {
      if (member.id === me.id)
        deny("I cannot change my nickname through these controls.");
    } else {
      const error = validateMemberAction({
        guild: context.guild,
        moderator: context.member,
        target: member,
      });
      if (error) deny(error);
    }
    switch (action.action) {
      case "warn": {
        if (member.user.bot || member.user.system || !member.manageable)
          deny("Choose a member who can be warned.");
        return async () => {
          const result = await this.services.warnings.execute(
            {
              guildId: context.guildId,
              targetUserId: member.id,
              moderatorUserId: context.userId,
              reason,
              durationMs: action.durationMs ?? null,
            },
            {
              prepareRole: async (_, count) => {
                this.requireActive(isActive);
                await context.guild.roles.fetch();
                this.requireActive(isActive);
                const name = getWarnRoleName(count);
                const role =
                  context.guild.roles.cache.find(
                    (entry) => entry.name === name,
                  ) ??
                  (await context.guild.roles.create({ name, reason: audit }));
                this.requireActive(isActive);
                const invalid =
                  role.id === context.guildId ||
                  role.managed ||
                  !role.editable ||
                  (context.member.id !== context.guild.ownerId &&
                    role.comparePositionTo(context.member.roles.highest) >= 0);
                return {
                  id: role.id,
                  name: role.name,
                  error: invalid
                    ? "That warning role cannot be managed with the current hierarchy."
                    : null,
                };
              },
              assignRole: async (_, roleId) => {
                await member.roles.add(roleId, audit);
              },
            },
          );
          if (result.status === "rejected") deny(result.reason);
          if (result.status !== "created") return deny("Warning rejected.");
          if (action.durationMs)
            this.services.scheduleWarning(
              context.guild.client,
              result.moderationCase,
            );
          return `Warning added — Case #${result.moderationCase.caseNumber}.`;
        };
      }
      case "unwarn": {
        if (member.user.bot || member.user.system)
          deny("Choose a member whose warning can be removed.");
        return async () => {
          const warning = await this.services.cases.revokeActiveWarning({
            guildId: context.guildId,
            targetUserId: member.id,
            moderatorUserId: context.userId,
            reason,
            caseNumber: action.caseNumber,
          });
          if (!warning)
            return deny("That member has no matching active warning.");
          this.services.cancelWarning(warning);
          const result = await this.services.removeWarningRole(
            context.guild.client,
            warning,
            audit,
          );
          return `Warning #${warning.caseNumber} removed.${result === "failed" ? " Its role could not be removed; the warning remains revoked." : ""}`;
        };
      }
      case "timeout":
      case "removetimeout": {
        if (!member.moderatable) deny("I cannot change that member's timeout.");
        return async () => {
          const durationMs =
            action.action === "timeout" ? action.durationMs : null;
          await member.timeout(durationMs, audit);
          const created = await this.services.cases.createCase({
            ...caseInput,
            action: "TIMEOUT",
            durationMs,
            metadata: { ...caseInput.metadata, removed: durationMs === null },
          });
          return `${durationMs === null ? "Timeout removed" : "Timeout added"} — Case #${created.caseNumber}.`;
        };
      }
      case "kick": {
        if (!member.kickable) deny("I cannot kick that member.");
        return async () => {
          await member.kick(audit);
          const created = await this.services.cases.createCase({
            ...caseInput,
            action: "KICK",
          });
          return `Member kicked — Case #${created.caseNumber}.`;
        };
      }
      case "ban": {
        if (!member.bannable) deny("I cannot ban that member.");
        return async () => {
          await context.guild.members.ban(member.id, {
            reason: audit,
            deleteMessageSeconds: action.deleteMessageSeconds ?? 0,
          });
          const created = await this.services.cases.createCase({
            ...caseInput,
            action: "BAN",
            metadata: {
              ...caseInput.metadata,
              deleteMessageSeconds: action.deleteMessageSeconds ?? 0,
            },
          });
          return `Member banned — Case #${created.caseNumber}.`;
        };
      }
      case "setnickname": {
        if (!member.manageable) deny("I cannot change that member's nickname.");
        return async () => {
          await member.setNickname(action.nickname || null, audit);
          return "Nickname updated.";
        };
      }
    }
  }
}
