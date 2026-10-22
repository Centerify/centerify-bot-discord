"use client";
import { useState } from "react";
import { Download, Shield } from "lucide-react";
import { useResource } from "@/lib/client";
import type { Event } from "@/lib/types";
import { download, relative } from "@/lib/utils";
import { useWorkspace } from "./shell";
import { Badge, Empty, Failure, Heading, Loading, Notice, SearchInput } from "./shared";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
export function ActivityPage() {
  const { guild, connection } = useWorkspace(),
    [q, setQ] = useState(""),
    [filter, setFilter] = useState(""),
    [selected, setSelected] = useState<Event | null>(null),
    query = useResource<Event[]>(guild.id, "audit");
  const rows =
    query.data?.filter(
      (e) =>
        (!filter || e.type.startsWith(filter)) &&
        `${e.summary} ${e.actorId ?? ""} ${e.type}`.toLowerCase().includes(q.toLowerCase()),
    ) ?? [];
  return (
    <>
      <Heading
        eyebrow="A CLEAR RECORD. A LITTLE PEACE OF MIND."
        title="Every little action leaves a trail."
        description="Understand what happened, who was involved, and where to look next."
      >
        <Button
          variant="secondary"
          onClick={() => download("centerify-audit.json", JSON.stringify(rows, null, 2))}
        >
          <Download size={14} />
          Export records
        </Button>
      </Heading>
      <div className="toolbar">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search activity, actor IDs, or events…"
        />
        <div className="toolbar-group">
          <select
            className="select-compact"
            aria-label="Activity type"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">All activity</option>
            <option value="audit.">Dashboard operations</option>
            <option value="moderation.">Moderation</option>
            <option value="ticket.">Tickets</option>
            <option value="command.">Commands</option>
            <option value="workflow.">Workflows</option>
            <option value="config.">Configuration</option>
            <option value="plugin.">Plugins</option>
            <option value="member.">Members</option>
          </select>
          <Badge tone={connection === "Live" ? "success" : "warning"}>{connection}</Badge>
        </div>
      </div>
      <section className="panel">
        {query.isPending ? (
          <Loading label="Reading the activity trail" />
        ) : query.error ? (
          <Failure error={query.error} retry={() => void query.refetch()} />
        ) : rows.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>What happened</th>
                    <th>Actor</th>
                    <th>When</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <Badge
                          tone={
                            e.type.includes("failed")
                              ? "error"
                              : e.type.startsWith("audit")
                                ? "purple"
                                : "neutral"
                          }
                        >
                          {e.type}
                        </Badge>
                      </td>
                      <td style={{ whiteSpace: "normal", minWidth: 230 }}>
                        <strong>{e.summary}</strong>
                      </td>
                      <td>{e.actorId ? <code>{e.actorId}</code> : "System"}</td>
                      <td>{relative(e.createdAt)}</td>
                      <td>
                        <Button variant="ghost" size="sm" onClick={() => setSelected(e)}>
                          Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel-footer">
              <span>Most recent 100 events · Guild scoped</span>
              <span>{rows.length} shown</span>
            </div>
          </>
        ) : (
          <Empty
            title="A quiet moment in your workspace"
            description="New activity will appear here as your community moves."
          />
        )}
      </section>
      <Notice>
        <Shield size={14} />
        An uncertain operation may have reached Discord before its result was recorded. Check the
        case history and Discord audit log before taking another action. The original operation key
        is retained to prevent duplicate execution.
      </Notice>
      <Dialog
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <DialogContent className="dialog-wide">
          <DialogTitle>Activity #{selected?.id}</DialogTitle>
          <DialogDescription>{selected?.summary}</DialogDescription>
          {selected && (
            <>
              <dl className="detail-list">
                <div>
                  <dt>Event</dt>
                  <dd>{selected.type}</dd>
                </div>
                <div>
                  <dt>Guild</dt>
                  <dd>
                    <code>{selected.guildId}</code>
                  </dd>
                </div>
                <div>
                  <dt>Actor</dt>
                  <dd>{selected.actorId ?? "System"}</dd>
                </div>
                <div>
                  <dt>Timestamp</dt>
                  <dd>{selected.createdAt}</dd>
                </div>
              </dl>
              <pre>{JSON.stringify(selected.data, null, 2)}</pre>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
