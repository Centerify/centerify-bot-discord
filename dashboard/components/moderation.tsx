"use client";
import { useState } from "react";
import { FileText, Plus, Shield } from "lucide-react";
import { useAction, useResource } from "@/lib/client";
import type { Case, Report } from "@/lib/types";
import { download, relative } from "@/lib/utils";
import { useWorkspace } from "./shell";
import { Badge, Empty, Failure, Heading, Loading, Notice, SearchInput } from "./shared";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { ModerationDialog } from "./moderation-dialog";
export function ModerationPage() {
  const { guild, notify } = useWorkspace(),
    [tab, setTab] = useState("cases"),
    [q, setQ] = useState(""),
    [filter, setFilter] = useState(""),
    [open, setOpen] = useState(false),
    [selected, setSelected] = useState<Case | null>(null),
    [unbanId, setUnbanId] = useState(""),
    [review, setReview] = useState<{ number: number; status: string } | null>(null);
  const cases = useResource<Case[]>(guild.id, "cases"),
    reports = useResource<Report[]>(guild.id, "reports", tab === "reports"),
    bans = useResource<{ id: string; name: string; reason: string | null }[]>(
      guild.id,
      "bans",
      tab === "bans",
    ),
    reviewAction = useAction(guild.id, "reports");
  const rows =
    cases.data?.filter(
      (c) =>
        (!filter || c.action === filter) &&
        `${c.caseNumber} ${c.targetUserId} ${c.reason}`.toLowerCase().includes(q.toLowerCase()),
    ) ?? [];
  const dataQuery = tab === "reports" ? reports : tab === "bans" ? bans : cases;
  return (
    <>
      <Heading
        eyebrow="A SAFER SPACE FOR EVERYONE"
        title="Fair decisions. Clear context."
        description="Keep a thoughtful record of the actions that protect your community."
      >
        <Button
          onClick={() => {
            setUnbanId("");
            setOpen(true);
          }}
        >
          <Plus size={15} />
          New action
        </Button>
      </Heading>
      <div className="tabs" role="tablist" aria-label="Moderation records">
        {[
          ["cases", "Cases"],
          ["reports", "Member reports"],
          ["bans", "Active bans"],
        ].map(([id, label]) => (
          <button
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            key={id}
            onClick={() => setTab(id!)}
          >
            {label}
            {id === "cases" && cases.data && <Badge>{cases.data.length}</Badge>}
          </button>
        ))}
      </div>
      {tab === "cases" && (
        <div className="toolbar">
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Search case number, member ID, or reason…"
          />
          <div className="toolbar-group">
            <select
              className="select-compact"
              aria-label="Filter moderation actions"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="">All actions</option>
              {["WARNING", "TIMEOUT", "KICK", "BAN", "UNBAN", "NOTE"].map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => download("centerify-cases.json", JSON.stringify(rows, null, 2))}
            >
              <FileText size={14} />
              Export
            </Button>
          </div>
        </div>
      )}
      <section className="panel">
        {dataQuery.isPending ? (
          <Loading label="Loading moderation records" />
        ) : dataQuery.error ? (
          <Failure error={dataQuery.error} retry={() => void dataQuery.refetch()} />
        ) : tab === "cases" ? (
          rows.length ? (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Case</th>
                      <th>Action</th>
                      <th>Member</th>
                      <th>Reason</th>
                      <th>Recorded</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>#{c.caseNumber}</strong>
                        </td>
                        <td>
                          <Badge tone={c.action.toLowerCase()}>
                            {c.action.charAt(0) + c.action.slice(1).toLowerCase()}
                          </Badge>
                        </td>
                        <td>
                          <code>{c.targetUserId}</code>
                        </td>
                        <td style={{ maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {c.reason}
                        </td>
                        <td>{relative(c.createdAt)}</td>
                        <td>
                          <Button variant="ghost" size="sm" onClick={() => setSelected(c)}>
                            Details
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="panel-footer">
                <span>Most recent 100 cases · Notes are staff only</span>
                <span>{rows.length} records</span>
              </div>
            </>
          ) : (
            <Empty
              title="Nothing to review here"
              description="Moderation cases appear here as your team takes action."
            />
          )
        ) : tab === "reports" ? (
          reports.data?.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Report</th>
                    <th>Reported member</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.data.map((r) => (
                    <tr key={r.id}>
                      <td>#{r.reportNumber}</td>
                      <td>
                        <code>{r.reportedUserId}</code>
                      </td>
                      <td style={{ whiteSpace: "normal", minWidth: 220 }}>{r.reason}</td>
                      <td>
                        <Badge tone={r.status === "PENDING" ? "warning" : "neutral"}>
                          {r.status}
                        </Badge>
                      </td>
                      <td>
                        {r.status === "PENDING" ? (
                          <div className="toolbar-group">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                setReview({ number: r.reportNumber, status: "ACCEPTED" })
                              }
                            >
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setReview({ number: r.reportNumber, status: "REJECTED" })
                              }
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          "Reviewed"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No open conversations to review"
              description="Member reports will appear here when submitted through Centerify."
            />
          )
        ) : bans.data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Reason</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {bans.data.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <strong>{b.name}</strong>
                      <span className="cell-sub">{b.id}</span>
                    </td>
                    <td>{b.reason ?? "No reason supplied"}</td>
                    <td>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setUnbanId(b.id);
                          setOpen(true);
                        }}
                      >
                        Review unban
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No active bans"
            description="The server’s current Discord bans will appear here."
          />
        )}
      </section>
      <Notice>
        <Shield size={14} />
        Server cases are local to this guild. Appeal status is not part of the current moderation
        model; record appeal context in a private moderator note.
      </Notice>
      <Dialog
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Case #{selected?.caseNumber}</DialogTitle>
          <DialogDescription>Recorded moderation context and evidence.</DialogDescription>
          {selected && (
            <>
              <dl className="detail-list">
                <div>
                  <dt>Action</dt>
                  <dd>{selected.action}</dd>
                </div>
                <div>
                  <dt>Member</dt>
                  <dd>
                    <code>{selected.targetUserId}</code>
                  </dd>
                </div>
                <div>
                  <dt>Moderator</dt>
                  <dd>
                    <code>{selected.moderatorUserId}</code>
                  </dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{new Date(selected.createdAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>
                    {selected.durationMs
                      ? `${selected.durationMs / 60000} minutes`
                      : "No fixed duration"}
                  </dd>
                </div>
              </dl>
              <Notice>{selected.reason}</Notice>
              <details>
                <summary className="inline-note">Evidence and case metadata</summary>
                <pre>{JSON.stringify(selected.metadata, null, 2)}</pre>
              </details>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!review}
        onOpenChange={(v) => {
          if (!v) setReview(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Review report #{review?.number}</DialogTitle>
          <DialogDescription>
            Set this report to {review?.status.toLowerCase()}. This records your review and does not
            automatically moderate the member.
          </DialogDescription>
          {reviewAction.error && <Notice tone="error">{reviewAction.error.message}</Notice>}
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setReview(null)}>
              Cancel
            </Button>
            <Button
              disabled={reviewAction.isPending}
              onClick={() =>
                reviewAction.mutate(review, {
                  onSuccess: () => {
                    setReview(null);
                    notify("Report review saved");
                  },
                })
              }
            >
              Confirm review
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <ModerationDialog
        open={open}
        onOpenChange={setOpen}
        userIds={unbanId ? [unbanId] : []}
        initialAction={unbanId ? "unban" : "warn"}
      />
    </>
  );
}
