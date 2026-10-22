"use client";
import { useState } from "react";
import { useAction, useResource } from "@/lib/client";
import type { TicketDetail } from "@/lib/types";
import { useWorkspace } from "./shell";
import { Notice } from "./shared";
import { Button } from "./ui/button";
import { relative } from "@/lib/utils";
export function TicketTools({ ticket }: { ticket: TicketDetail }) {
  const { guild, me, notify } = useWorkspace(),
    action = useAction<{ message?: string }>(guild.id, `tickets/${ticket.id}`),
    [note, setNote] = useState(""),
    [member, setMember] = useState(""),
    [tags, setTags] = useState(ticket.tags?.join(", ") ?? "");
  const run = (input: unknown) =>
    action.mutate(input, {
      onSuccess: (result) => {
        notify(result.message ?? "Ticket updated");
        setNote("");
      },
    });
  return (
    <section className="panel section-spacer">
      <div className="panel-header">
        <h2>Support workflow</h2>
      </div>
      <div className="panel-body form-stack">
        <label>
          Priority
          <select
            value={ticket.priority ?? "normal"}
            disabled={action.isPending || ticket.state !== "open"}
            onChange={(e) => run({ action: "priority", priority: e.target.value })}
          >
            {["low", "normal", "high", "urgent"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <div className="toolbar-group">
          <Button
            variant="secondary"
            size="sm"
            disabled={action.isPending || ticket.state !== "open"}
            onClick={() => run({ action: ticket.claimedBy === me.user.id ? "unclaim" : "claim" })}
          >
            Claim for me
          </Button>
          {ticket.claimedBy && (
            <Button
              variant="ghost"
              size="sm"
              disabled={action.isPending}
              onClick={() => run({ action: "unclaim" })}
            >
              Release claim
            </Button>
          )}
        </div>
        <label>
          Assign or add participant
          <input
            value={member}
            onChange={(e) => setMember(e.target.value)}
            placeholder="Discord member ID"
            pattern="\d{17,20}"
          />
        </label>
        <div className="toolbar-group">
          <Button
            variant="secondary"
            size="sm"
            disabled={action.isPending || !/^\d{17,20}$/.test(member)}
            onClick={() => run({ action: "claim", member })}
          >
            Assign staff
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={action.isPending || !/^\d{17,20}$/.test(member)}
            onClick={() => run({ action: "add", member })}
          >
            Add participant
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={action.isPending || !/^\d{17,20}$/.test(member)}
            onClick={() => run({ action: "remove", member })}
          >
            Remove participant
          </Button>
        </div>
        <label>
          Tags
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="verification, account"
          />
        </label>
        <Button
          variant="secondary"
          size="sm"
          disabled={action.isPending}
          onClick={() =>
            run({
              action: "tags",
              tags: tags
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean),
            })
          }
        >
          Save tags
        </Button>
        <label>
          Private staff note
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            placeholder="Context for the support team. Hidden from the ticket owner."
          />
        </label>
        <Button
          variant="secondary"
          size="sm"
          disabled={action.isPending || !note.trim()}
          onClick={() => run({ action: "note", text: note })}
        >
          Save private note
        </Button>
        {ticket.notes?.map((n, i) => (
          <div key={i}>
            <small>
              {n.by} · {relative(new Date(n.at).toISOString())}
            </small>
            <p className="inline-note" style={{ whiteSpace: "pre-wrap" }}>
              {n.text}
            </p>
          </div>
        ))}
        <Button
          variant="secondary"
          disabled={action.isPending}
          onClick={() => run({ action: "transcript" })}
        >
          Archive full transcript
        </Button>
        {ticket.transcript?.url.startsWith("https://discord.com/") && (
          <a className="text-link" href={ticket.transcript.url} target="_blank" rel="noreferrer">
            Open archived transcript {ticket.transcript.truncated ? "(partial)" : ""}
          </a>
        )}
        {action.error && <Notice tone="error">{action.error.message}</Notice>}
      </div>
    </section>
  );
}
export function TicketDepartments() {
  const { guild, notify } = useWorkspace(),
    query = useResource<{ id: string; profiles: Record<string, unknown>[] }[]>(
      guild.id,
      "ticket-profiles",
    ),
    action = useAction(guild.id, "ticket-profiles"),
    [text, setText] = useState(""),
    [pluginId, setPluginId] = useState(""),
    [revision, setRevision] = useState(0),
    [error, setError] = useState("");
  return (
    <section className="panel section-spacer">
      <div className="panel-header">
        <div>
          <h2>Better Ticket departments</h2>
          <p>
            Routing, intake forms, staff roles, transcript destinations and notification messages.
          </p>
        </div>
      </div>
      <div className="panel-body">
        {query.error ? (
          <Notice tone="error">{query.error.message}</Notice>
        ) : query.data?.length ? (
          <>
            <div className="toolbar-group">
              {query.data.flatMap((p) =>
                p.profiles.map((profile) => (
                  <Button
                    key={`${p.id}:${profile.key}`}
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setPluginId(p.id);
                      setText(JSON.stringify(profile, null, 2));
                      setRevision(Number(profile.revision ?? 0));
                    }}
                  >
                    {String(profile.title ?? profile.key)}
                  </Button>
                )),
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setPluginId(query.data![0]!.id);
                  setRevision(0);
                  setText(
                    JSON.stringify(
                      {
                        key: "support",
                        title: "Support",
                        categoryId: "",
                        supportRoleIds: [],
                        transcriptChannelId: "",
                        archiveCategoryId: null,
                        welcome: "A team member will be with you shortly.",
                        questions: [{ label: "How can we help?", required: true }],
                        enabled: true,
                        openLimit: 1,
                        cooldownSeconds: 60,
                        autoCloseMinutes: 0,
                        requiredRoleId: null,
                        staffCloseOnly: false,
                      },
                      null,
                      2,
                    ),
                  );
                }}
              >
                New department
              </Button>
            </div>
            {text && (
              <>
                <label className="section-spacer">
                  Department definition
                  <textarea
                    className="code-editor"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                </label>
                <div className="form-actions">
                  <Button
                    disabled={action.isPending}
                    onClick={() => {
                      try {
                        const profile: unknown = JSON.parse(text);
                        action.mutate(
                          { pluginId, profile, revision },
                          {
                            onSuccess: () => {
                              setText("");
                              notify("Department saved");
                            },
                          },
                        );
                      } catch {
                        setError("Enter valid department JSON");
                      }
                    }}
                  >
                    Save department
                  </Button>
                </div>
              </>
            )}
            {(error || action.error) && (
              <Notice tone="error">{error || action.error?.message}</Notice>
            )}
          </>
        ) : (
          <Notice>
            Install or update Better Ticket to version 1.1.0 with the operator installer, then
            restart Centerify to manage departments here. Existing ticket data is preserved.
          </Notice>
        )}
      </div>
    </section>
  );
}
