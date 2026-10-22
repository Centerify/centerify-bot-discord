"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Download,
  MessageSquare,
  Ticket as TicketIcon,
} from "lucide-react";
import { useAction, useResource } from "@/lib/client";
import type { Ticket, TicketDetail } from "@/lib/types";
import { download, relative } from "@/lib/utils";
import { useWorkspace } from "./shell";
import { Badge, Empty, Failure, Heading, Loading, Notice, SearchInput } from "./shared";
import { Button } from "./ui/button";
import { TicketTools } from "./ticket-tools";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
export function TicketsPage() {
  const { guild, me, notify } = useWorkspace(),
    [filter, setFilter] = useState("open"),
    [q, setQ] = useState(""),
    [selected, setSelected] = useState(""),
    [confirm, setConfirm] = useState(false);
  const tickets = useResource<Ticket[]>(guild.id, "tickets"),
    detail = useResource<TicketDetail>(guild.id, `tickets/${selected}`, !!selected),
    action = useAction(guild.id, `tickets/${selected}`);
  const rows =
    tickets.data?.filter(
      (t) =>
        (filter === "all" || t.state === filter) &&
        `${t.name} ${t.ownerId}`.toLowerCase().includes(q.toLowerCase()),
    ) ?? [];
  if (selected)
    return (
      <>
        <Heading
          eyebrow="SUPPORT, WITH A HUMAN TOUCH"
          title={detail.data?.name ?? "Ticket conversation"}
          description="A private conversation, visible only when your Discord channel permissions allow it."
        >
          <Button variant="secondary" onClick={() => setSelected("")}>
            <ArrowLeft size={14} />
            Back to inbox
          </Button>
        </Heading>
        {detail.isPending ? (
          <Loading />
        ) : detail.error ? (
          <Failure error={detail.error} />
        ) : (
          detail.data && (
            <>
              <div className="detail-grid">
                <section className="panel">
                  <div className="panel-header">
                    <h2>Conversation</h2>
                    <Badge tone={detail.data.state === "open" ? "success" : "neutral"}>
                      {detail.data.state}
                    </Badge>
                  </div>
                  <div className="conversation">
                    {detail.data.messages.length ? (
                      detail.data.messages.map((m) => (
                        <div className="message" key={m.id}>
                          <div className="message-header">
                            <span className="member-avatar">
                              {m.author.slice(0, 2).toUpperCase()}
                            </span>
                            <strong>{m.author}</strong>
                            <time>{relative(m.createdAt)}</time>
                          </div>
                          <p>{m.content}</p>
                          {m.embeds.map((e, i) => (
                            <div key={i} className="message-embed">
                              <strong>{e.title}</strong>
                              <p>{e.description}</p>
                            </div>
                          ))}
                          {m.attachments
                            .filter(
                              (a) =>
                                a.url.startsWith("https://cdn.discordapp.com/") ||
                                a.url.startsWith("https://media.discordapp.net/"),
                            )
                            .map((a) => (
                              <a
                                key={a.url}
                                href={a.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-link"
                              >
                                {a.name}
                                <ArrowUpRight size={12} />
                              </a>
                            ))}
                        </div>
                      ))
                    ) : (
                      <Empty
                        title="The conversation is just beginning"
                        description="Messages sent in the Discord ticket channel appear here."
                      />
                    )}
                  </div>
                  <div className="panel-footer">
                    <span>
                      Latest 100 messages
                      {detail.data.truncated ? " · Older history is available in Discord" : ""}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        download(
                          `ticket-${selected}.txt`,
                          detail
                            .data!.messages.map(
                              (m) =>
                                `[${m.createdAt}] ${m.author} (${m.authorId})\n${m.content}\n${m.attachments.map((a) => a.url).join("\n")}`,
                            )
                            .join("\n\n"),
                          "text/plain",
                        )
                      }
                    >
                      <Download size={13} />
                      Export shown transcript
                    </Button>
                  </div>
                </section>
                <aside>
                  <section className="panel">
                    <div className="panel-header">
                      <h2>The little details</h2>
                    </div>
                    <div className="panel-body">
                      <dl className="detail-list">
                        <div>
                          <dt>Ticket ID</dt>
                          <dd>
                            <code>{selected}</code>
                          </dd>
                        </div>
                        <div>
                          <dt>Opened by</dt>
                          <dd>
                            <code>{detail.data.ownerId}</code>
                          </dd>
                        </div>
                        <div>
                          <dt>Support role</dt>
                          <dd>
                            <code>{detail.data.supportRoleId}</code>
                          </dd>
                        </div>
                        <div>
                          <dt>Status</dt>
                          <dd>{detail.data.state}</dd>
                        </div>
                      </dl>
                      <div className="form-actions">
                        <Button
                          variant={detail.data.state === "open" ? "secondary" : "default"}
                          onClick={() => setConfirm(true)}
                        >
                          {detail.data.state === "open" ? "Close ticket" : "Reopen ticket"}
                        </Button>
                      </div>
                      <Button asChild variant="ghost" className="section-spacer">
                        <a
                          href={`https://discord.com/channels/${guild.id}/${selected}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Continue in Discord <ArrowUpRight size={13} />
                        </a>
                      </Button>
                    </div>
                  </section>
                  {detail.data.source === "better-ticket" ? (
                    <TicketTools ticket={detail.data} />
                  ) : (
                    <Notice>
                      Built-in tickets preserve their state in Discord channel topics. Assignment,
                      priorities, tags, internal notes and archive routing are available through the
                      Better Ticket plugin where configured.
                    </Notice>
                  )}
                </aside>
              </div>
              <Dialog open={confirm} onOpenChange={setConfirm}>
                <DialogContent>
                  <DialogTitle>
                    {detail.data.state === "open"
                      ? "Close this conversation?"
                      : "Open the conversation again?"}
                  </DialogTitle>
                  <DialogDescription>
                    {detail.data.state === "open"
                      ? "The channel and message history are preserved. Participants will no longer be able to send messages."
                      : "The ticket owner and support role will regain access to send messages. Review additional participant access in Discord after reopening."}
                  </DialogDescription>
                  {action.error && <Notice tone="error">{action.error.message}</Notice>}
                  <div className="form-actions">
                    <Button variant="secondary" onClick={() => setConfirm(false)}>
                      Cancel
                    </Button>
                    <Button
                      disabled={action.isPending}
                      onClick={() =>
                        action.mutate(
                          { action: detail.data!.state === "open" ? "close" : "reopen" },
                          {
                            onSuccess: () => {
                              setConfirm(false);
                              notify(me.user.demo ? "Ticket state simulated" : "Ticket updated");
                            },
                          },
                        )
                      }
                    >
                      Confirm {me.user.demo ? "simulation" : "change"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )
        )}
      </>
    );
  return (
    <>
      <Heading
        eyebrow="EVERY QUESTION DESERVES A LITTLE CARE"
        title="A helping hand, right here."
        description="Keep support conversations moving and make sure no one is left waiting."
      >
        <Button asChild variant="secondary">
          <Link href="/settings">
            Ticket settings <ArrowUpRight size={14} />
          </Link>
        </Button>
      </Heading>
      <div className="toolbar">
        <div
          className="tabs"
          style={{ marginBottom: 0, border: 0 }}
          role="tablist"
          aria-label="Ticket status"
        >
          {["open", "closed", "all"].map((status) => (
            <button
              key={status}
              role="tab"
              aria-selected={filter === status}
              onClick={() => setFilter(status)}
              className={filter === status ? "active" : ""}
              style={{ textTransform: "capitalize" }}
            >
              {status}
              <Badge>
                {tickets.data?.filter((t) => status === "all" || t.state === status).length ?? 0}
              </Badge>
            </button>
          ))}
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Search tickets or member IDs…" />
      </div>
      {tickets.isPending ? (
        <Loading label="Opening the support inbox" />
      ) : tickets.error ? (
        <Failure error={tickets.error} retry={() => void tickets.refetch()} />
      ) : rows.length ? (
        <div className="cards-grid">
          {rows.map((t) => (
            <button
              key={t.id}
              className="panel ticket-card"
              onClick={() => setSelected(t.id)}
              style={{ textAlign: "left" }}
            >
              <div className="ticket-card-top">
                <span className="ticket-icon">
                  <TicketIcon size={18} />
                </span>
                <Badge tone={t.state === "open" ? "success" : "neutral"}>{t.state}</Badge>
              </div>
              <h3>{t.name.replaceAll("-", " ")}</h3>
              <p>
                Opened by <code>{t.ownerId}</code>
              </p>
              <div className="ticket-card-footer">
                <span>
                  <MessageSquare size={12} style={{ display: "inline", marginRight: 5 }} />
                  View conversation
                </span>
                <span>{relative(t.createdAt)}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title="A quiet inbox. A good moment."
            description="No tickets match this view. New tickets opened through Centerify will appear here."
          />
        </section>
      )}
      <Notice>
        Open tickets through your Discord ticket panel or <code>/ticket open</code>. This inbox
        includes built-in tickets and tickets from explicitly installed, configured plugins. Plugin
        conversations retain their existing staff and channel permission checks.
      </Notice>
    </>
  );
}
