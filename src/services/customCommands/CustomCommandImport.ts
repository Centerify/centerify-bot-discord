import type { Attachment } from "discord.js";
import { CUSTOM_COMMAND_LIMITS as L } from "../../lib/customCommands/constants.js";
import { CustomCommandValidationError } from "../../lib/customCommands/errors.js";
/** Only Discord attachment URLs are fetched; redirects and oversize streams fail closed. */
export async function readCommandAttachment(
  attachment: Attachment,
  format: "json" | "markdown" = "json",
): Promise<string> {
  const maxBytes = format === "json" ? L.importBytes : L.markdownInput * 4;
  const extensions = format === "json" ? [".json"] : [".md", ".markdown"];
  if (
    attachment.size > maxBytes ||
    !extensions.some((extension) =>
      attachment.name.toLowerCase().endsWith(extension),
    )
  )
    throw new CustomCommandValidationError(
      format === "json"
        ? "Upload a JSON file no larger than 8 MB."
        : `Upload a .md or .markdown file no larger than ${maxBytes} bytes.`,
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
      if (bytes > maxBytes)
        throw new CustomCommandValidationError("Import file is too large.");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}
