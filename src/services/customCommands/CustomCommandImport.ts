import type { Attachment } from "discord.js";
import { CUSTOM_COMMAND_LIMITS as L } from "../../lib/customCommands/constants.js";
import { CustomCommandValidationError } from "../../lib/customCommands/errors.js";
/** Only Discord attachment URLs are fetched; redirects and oversize streams fail closed. */
export async function readCommandAttachment(
  attachment: Attachment,
): Promise<string> {
  if (
    attachment.size > L.importBytes ||
    !attachment.name.toLowerCase().endsWith(".json")
  )
    throw new CustomCommandValidationError(
      "Upload a JSON file no larger than 8 MB.",
    );
  const url = new URL(attachment.url);
  if (
    url.protocol !== "https:" ||
    !["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname) ||
    !url.pathname.startsWith("/attachments/") ||
    url.username ||
    url.password
  )
    throw new CustomCommandValidationError(
      "Import must use a Discord attachment.",
    );
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok || !response.body)
    throw new CustomCommandValidationError(
      "Could not read the import attachment.",
    );
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > L.importBytes)
        throw new CustomCommandValidationError("Import file is too large.");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}
