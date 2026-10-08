export type WarningLifecycleView = {
  action: string;
  durationMs: number | null;
  metadata?: unknown;
  createdAt: string;
};

export type WarningRevocation = {
  revokedAt: string;
  revokedBy: string;
  revocationReason: string;
};

export function getWarningExpiresAt(warning: WarningLifecycleView) {
  if (warning.action !== "WARNING" || !warning.durationMs) {
    return null;
  }

  const createdAtMs = Date.parse(warning.createdAt);
  if (!Number.isFinite(createdAtMs)) {
    return null;
  }

  return new Date(createdAtMs + warning.durationMs);
}

export function hasWarningDurationEnded(
  warning: WarningLifecycleView,
  now: Date | number = Date.now(),
) {
  const expiresAt = getWarningExpiresAt(warning);
  const nowMs = typeof now === "number" ? now : now.getTime();

  return expiresAt !== null && expiresAt.getTime() <= nowMs;
}

export function isActiveWarning(
  warning: WarningLifecycleView,
  now: Date | number = Date.now(),
) {
  return (
    warning.action === "WARNING" &&
    !getWarningRevocation(warning.metadata) &&
    !hasWarningDurationEnded(warning, now)
  );
}

export function warningRoleId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const roleId = (metadata as Record<string, unknown>)["warningRoleId"];
  return typeof roleId === "string" ? roleId : null;
}

export function getWarningRevocation(metadata: unknown): WarningRevocation | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const revokedAt = record["warningRevokedAt"];
  const revokedBy = record["warningRevokedBy"];
  const revocationReason = record["warningRevocationReason"];

  if (
    typeof revokedAt !== "string" ||
    !Number.isFinite(Date.parse(revokedAt)) ||
    typeof revokedBy !== "string" ||
    typeof revocationReason !== "string"
  ) {
    return null;
  }

  return { revokedAt, revokedBy, revocationReason };
}
