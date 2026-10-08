import { serviceToken } from "../../../core/index.js";
import { serviceRef } from "../../../adapters/discord/context.js";
import type { Client } from "discord.js";
import { guildOwnershipService } from "../../guilds/discord/index.js";
import { logger } from "../../../adapters/logging/runtime.js";
import { toAuditLogReason } from "./commandUtils.js";
import { moderationCaseService } from "./services.js";
import {
  getWarningRevocation,
  getWarningExpiresAt,
  hasWarningDurationEnded,
  warningRoleId,
} from "../domain/warningLifecycle.js";

export { getWarnRoleName } from "./warningRoleNames.js";

const maxTimerDelayMs = 2_147_483_647;


export type WarningRoleView = {
  guildId: string;
  caseNumber: number;
  targetUserId: string;
  action: string;
  durationMs: number | null;
  metadata?: unknown;
  createdAt: string;
};

export type WarningRoleRemovalResult =
  | "removed"
  | "retained"
  | "not-assigned"
  | "failed";

export function createWarningRoleLifecycle() {
  const scheduledExpirations = new Map<string, ReturnType<typeof setTimeout>>();
function scheduleWarningRoleRemoval(
  client: Client,
  warning: WarningRoleView,
) {
  const expiresAt = getWarningExpiresAt(warning);
  if (!expiresAt || !warningRoleId(warning.metadata)) {
    return false;
  }

  const key = warningKey(warning);
  const existingTimer = scheduledExpirations.get(key);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const remainingMs = Math.max(0, expiresAt.getTime() - Date.now());
  const timer = setTimeout(() => {
    scheduledExpirations.delete(key);
    if (remainingMs > maxTimerDelayMs) {
      scheduleWarningRoleRemoval(client, warning);
      return;
    }

    void wipeExpiredWarningRole(
      client,
      warning.guildId,
      warning.caseNumber,
    ).catch((error) => {
      logger.error(
        {
          err: error,
          guildId: warning.guildId,
          userId: warning.targetUserId,
          caseNumber: warning.caseNumber,
        },
        "Failed to process warning expiration",
      );
    });
  }, Math.min(remainingMs, maxTimerDelayMs));

  scheduledExpirations.set(key, timer);
  return true;
}

function cancelWarningRoleRemoval(
  warning: Pick<WarningRoleView, "guildId" | "caseNumber">,
) {
  const key = warningKey(warning);
  const timer = scheduledExpirations.get(key);
  if (!timer) {
    return false;
  }

  clearTimeout(timer);
  scheduledExpirations.delete(key);
  return true;
}

async function restoreWarningRoleExpirations(client: Client) {
  const warnings = await moderationCaseService.warningsForRoleRestoration();
  let restoredCount = 0;

  for (const warning of warnings) {
    const revocation = getWarningRevocation(warning.metadata);
    if (revocation) {
      await removeWarningRoleIfUnused(
        client,
        warning,
        `Warning #${warning.caseNumber} was revoked`,
      );
      restoredCount += 1;
      continue;
    }

    if (scheduleWarningRoleRemoval(client, warning)) {
      restoredCount += 1;
    }
  }

  return restoredCount;
}

async function wipeExpiredWarningRole(
  client: Client,
  guildId: string,
  caseNumber: number,
) {
  const warning = await moderationCaseService.findByCaseNumber(guildId, caseNumber);
  if (!warning || !hasWarningDurationEnded(warning)) {
    if (warning) {
      scheduleWarningRoleRemoval(client, warning);
    }
    return false;
  }

  const roleId = warningRoleId(warning.metadata);
  if (!roleId) {
    return false;
  }

  const result = await removeWarningRoleIfUnused(
    client,
    warning,
    `Warning #${warning.caseNumber} duration expired`,
  );
  return result === "removed";
}

async function removeWarningRoleIfUnused(
  client: Client,
  warning: WarningRoleView,
  auditReason: string,
): Promise<WarningRoleRemovalResult> {
  const roleId = warningRoleId(warning.metadata);
  if (!roleId) {
    return "not-assigned";
  }

  try {
    const activeWarnings = await moderationCaseService.activeWarningsForUser(
      warning.guildId,
      warning.targetUserId,
    );
    const roleStillNeeded = activeWarnings.some(
      (activeWarning) => warningRoleId(activeWarning.metadata) === roleId,
    );
    if (roleStillNeeded) {
      return "retained";
    }

    const guild = await client.guilds.fetch(warning.guildId);
    if (!await guildOwnershipService.isVerified(guild)) return "failed";
    const member = await guild.members.fetch(warning.targetUserId);
    if (!member.roles.cache.has(roleId)) {
      return "not-assigned";
    }

    await member.roles.remove(roleId, toAuditLogReason(auditReason));
    return "removed";
  } catch (error) {
    logger.warn(
      {
        err: error,
        guildId: warning.guildId,
        userId: warning.targetUserId,
        roleId,
        caseNumber: warning.caseNumber,
      },
      "Failed to remove warning role",
    );
    return "failed";
  }
}

function warningKey(warning: Pick<WarningRoleView, "guildId" | "caseNumber">) {
  return `${warning.guildId}:${warning.caseNumber}`;
}

  return {
    scheduleWarningRoleRemoval, cancelWarningRoleRemoval, restoreWarningRoleExpirations, wipeExpiredWarningRole, removeWarningRoleIfUnused,
    stop() { for (const timer of scheduledExpirations.values()) clearTimeout(timer); scheduledExpirations.clear(); },
  };
}
export const warningLifecycleToken = serviceToken<ReturnType<typeof createWarningRoleLifecycle>>("moderation.warningRoles");
export const scheduleWarningRoleRemoval = (...args: Parameters<ReturnType<typeof createWarningRoleLifecycle>["scheduleWarningRoleRemoval"]>) => serviceRef(warningLifecycleToken).scheduleWarningRoleRemoval(...args);
export const cancelWarningRoleRemoval = (...args: Parameters<ReturnType<typeof createWarningRoleLifecycle>["cancelWarningRoleRemoval"]>) => serviceRef(warningLifecycleToken).cancelWarningRoleRemoval(...args);
export const restoreWarningRoleExpirations = (...args: Parameters<ReturnType<typeof createWarningRoleLifecycle>["restoreWarningRoleExpirations"]>) => serviceRef(warningLifecycleToken).restoreWarningRoleExpirations(...args);
export const wipeExpiredWarningRole = (...args: Parameters<ReturnType<typeof createWarningRoleLifecycle>["wipeExpiredWarningRole"]>) => serviceRef(warningLifecycleToken).wipeExpiredWarningRole(...args);
export const removeWarningRoleIfUnused = (...args: Parameters<ReturnType<typeof createWarningRoleLifecycle>["removeWarningRoleIfUnused"]>) => serviceRef(warningLifecycleToken).removeWarningRoleIfUnused(...args);
