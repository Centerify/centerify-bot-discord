import type { TextChannel } from "discord.js";
import type { Ticket } from "./state.js";

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
}
export function safeLink(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? escapeHtml(url.href) : "";
  } catch {
    return "";
  }
}
export interface TranscriptMessage {
  id: string;
  author: string;
  authorId: string;
  content: string;
  createdAt: string;
  edited: boolean;
  attachments: { name: string; url: string }[];
  embeds: string[];
}
export function transcriptHtml(ticket: Ticket, messages: TranscriptMessage[], truncated: boolean) {
  const title = `Ticket #${ticket.number} · ${ticket.profile.title}`;
  const intro = `<h1>${escapeHtml(title)}</h1><p>Owner: ${ticket.ownerId} · Priority: ${ticket.priority} · Opened: ${new Date(ticket.createdAt).toISOString()}</p>${truncated ? "<p class=notice>Partial export: the latest 2000 messages or the 2 MiB export limit was reached. Earlier messages remain in Discord.</p>" : ""}`;
  const body = messages
    .map(
      (message) =>
        `<article><header><strong>${escapeHtml(message.author)}</strong> (${escapeHtml(message.authorId)}) <time>${escapeHtml(message.createdAt)}</time>${message.edited ? " (edited)" : ""}</header><pre>${escapeHtml(message.content)}</pre>${message.embeds.map((embed) => `<blockquote>${escapeHtml(embed)}</blockquote>`).join("")}${message.attachments
          .map((file) => {
            const url = safeLink(file.url);
            return url
              ? `<p><a rel="noreferrer noopener" href="${url}">${escapeHtml(file.name)}</a></p>`
              : "";
          })
          .join("")}</article>`,
    )
    .join("\n");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(title)}</title><style>body{max-width:960px;margin:36px auto;padding:0 24px;background:#14171d;color:#e5e9f0;font:15px/1.6 system-ui}article{border-top:1px solid #343a46;padding:16px 0}header,time{color:#aeb8ca}pre,blockquote{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}a{color:#9bb5ff}.notice{padding:16px;background:#493b1f}h1{font-size:24px}</style>${intro}${body}<footer>Better Ticket export. Staff notes are private and excluded. Attachment links may expire; files are not embedded.</footer></html>`;
}
export async function collectTranscript(channel: TextChannel, ticket: Ticket) {
  const messages: TranscriptMessage[] = [];
  let before: string | undefined;
  let truncated = false;
  let size = 0;
  while (messages.length < 2000) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!batch.size) break;
    for (const message of batch.values()) {
      const row: TranscriptMessage = {
        id: message.id,
        author: message.author.tag,
        authorId: message.author.id,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        edited: !!message.editedTimestamp,
        attachments: [...message.attachments.values()].map((file) => ({
          name: file.name,
          url: file.url,
        })),
        embeds: message.embeds.map((embed) =>
          [
            embed.title,
            embed.description,
            ...embed.fields.map((field) => `${field.name}: ${field.value}`),
          ]
            .filter(Boolean)
            .join("\n"),
        ),
      };
      size += Buffer.byteLength(JSON.stringify(row));
      if (size > 2 * 1024 * 1024) {
        truncated = true;
        break;
      }
      messages.push(row);
    }
    if (truncated) break;
    before = batch.last()!.id;
    if (batch.size < 100) break;
  }
  if (messages.length >= 2000) truncated = true;
  messages.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0));
  let html = transcriptHtml(ticket, messages, truncated);
  while (Buffer.byteLength(html) > 2 * 1024 * 1024 && messages.length) {
    truncated = true;
    const keep = Math.max(
      0,
      Math.floor(messages.length * ((2 * 1024 * 1024) / Buffer.byteLength(html)) * 0.9),
    );
    messages.splice(0, messages.length - keep);
    html = transcriptHtml(ticket, messages, truncated);
  }
  return { html, truncated };
}
