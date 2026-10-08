const durationPattern = /^(\d{1,3})([mhd])$/i;
const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

export const maxDiscordTimeoutMs = 28 * dayMs;

export function parseDuration(input: string) {
  const match = durationPattern.exec(input.trim());
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase();

  const multiplier =
    unit === "m" ? minuteMs : unit === "h" ? hourMs : unit === "d" ? dayMs : 0;

  const durationMs = amount * multiplier;
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
    return null;
  }

  return durationMs;
}

export function formatDuration(durationMs: number | null | undefined) {
  if (!durationMs) {
    return "None";
  }

  const days = Math.floor(durationMs / dayMs);
  const hours = Math.floor((durationMs % dayMs) / hourMs);
  const minutes = Math.floor((durationMs % hourMs) / minuteMs);

  const parts = [
    days > 0 ? `${days}d` : null,
    hours > 0 ? `${hours}h` : null,
    minutes > 0 ? `${minutes}m` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" ") : `${Math.ceil(durationMs / 1_000)}s`;
}
