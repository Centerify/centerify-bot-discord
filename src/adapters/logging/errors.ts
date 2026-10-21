/** Discord REST errors carry request bodies and token-bearing URLs. Log only diagnostics. */
export function serializeError(error: unknown): Record<string, unknown> {
  const redact = (value: string) => {
    let result = value;
    for (const secret of [process.env.DISCORD_TOKEN, process.env.DATABASE_URL]) {
      if (secret) {
        result = result.replaceAll(secret, "[redacted]");
        if (secret.trim()) result = result.replaceAll(secret.trim(), "[redacted]");
      }
    }
    return result
      .replace(
        /https:\/\/(?:[\w.-]*\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?(?:webhooks|interactions)\/[^\s)"']+/gi,
        "[redacted Discord endpoint]",
      )
      .replace(/postgres(?:ql)?:\/\/[^\s)"']+/gi, "[redacted database URL]");
  };
  if (!error || typeof error !== "object") return { type: "UnknownError" };
  const fields = error as Record<string, unknown>;
  return {
    type: typeof fields.name === "string" ? redact(fields.name) : "Error",
    ...(typeof fields.message === "string" ? { message: redact(fields.message) } : {}),
    ...(typeof fields.stack === "string" ? { stack: redact(fields.stack) } : {}),
    ...(typeof fields.code === "number" ? { code: fields.code } : {}),
  };
}
