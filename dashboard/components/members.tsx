"use client";
import { useState } from "react";
import { ArrowLeft, ArrowUpRight, ChevronRight, Filter, Shield, Users } from "lucide-react";
import { useResource } from "@/lib/client";
import type { Case, Member, Resources } from "@/lib/types";
import { relative } from "@/lib/utils";
import { useWorkspace } from "./shell";
import { Badge, Empty, Failure, Heading, Loading, SearchInput } from "./shared";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { ModerationDialog } from "./moderation-dialog";
export function MembersPage() {
  const { guild } = useWorkspace(),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [after, setAfter] = useState(""),
    [role, setRole] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [profile, setProfile] = useState(""),
    [actionOpen, setActionOpen] = useState(false),
    [actionIds, setActionIds] = useState<string[]>([]);
  const members = useResource<{ items: Member[]; after: string | null }>(
      guild.id,
      `members?q=${encodeURIComponent(search)}${after ? `&after=${after}` : ""}`,
    ),
    resources = useResource<Resources>(guild.id, "resources"),
    detail = useResource<{ member: Member; cases: Case[]; xp: number }>(
      guild.id,
      `members/${profile}`,
      !!profile,
    );
  const items =
    members.data?.items.filter((m) => !role || m.roles.some((r) => r.id === role)) ?? [];
  return (
    <>
      <Heading
        eyebrow="THE PEOPLE BEHIND YOUR COMMUNITY"
        title="Good people. One place."
        description="Find a familiar face, lend a hand, or keep your community safe."
      >
        <Button
          variant="secondary"
          onClick={() => {
            setActionIds(selected);
            setActionOpen(true);
          }}
        >
          <Shield size={15} />
          {selected.length ? `Manage ${selected.length} members` : "Moderation action"}
        </Button>
      </Heading>
      <div className="toolbar">
        <form
          className="toolbar-group"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q);
            setAfter("");
          }}
        >
          <SearchInput value={q} onChange={setQ} placeholder="Search members by name…" />
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
        </form>
        <div className="toolbar-group">
          <Filter size={14} style={{ color: "var(--subtle)" }} />
          <select
            className="select-compact"
            aria-label="Filter members by role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="">All roles</option>
            {resources.data?.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <span className="count-label">{items.length} shown · up to 50 per page</span>
        </div>
      </div>
      <section className="panel">
        {members.isPending ? (
          <Loading label="Finding your people" />
        ) : members.error ? (
          <Failure error={members.error} retry={() => void members.refetch()} />
        ) : items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Select visible members"
                        checked={items.length > 0 && items.every((m) => selected.includes(m.id))}
                        onChange={(e) =>
                          setSelected(e.target.checked ? items.slice(0, 20).map((m) => m.id) : [])
                        }
                      />
                    </th>
                    <th>Member</th>
                    <th>Roles</th>
                    <th>Joined</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">View profile</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${m.name}`}
                          checked={selected.includes(m.id)}
                          disabled={!selected.includes(m.id) && selected.length >= 20}
                          onChange={(e) =>
                            setSelected((ids) =>
                              e.target.checked ? [...ids, m.id] : ids.filter((id) => id !== m.id),
                            )
                          }
                        />
                      </td>
                      <td>
                        <button className="row-button" onClick={() => setProfile(m.id)}>
                          <span className="member-avatar">
                            {m.name
                              .split(" ")
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join("")}
                          </span>
                          <span>
                            <strong>{m.name}</strong>
                            <span className="cell-sub">@{m.username}</span>
                          </span>
                        </button>
                      </td>
                      <td>
                        <div className="role-list">
                          {m.roles.slice(0, 3).map((r) => (
                            <span key={r.id} className="role-badge">
                              <i style={{ background: r.color || "var(--accent)" }} />
                              {r.name}
                            </span>
                          ))}
                          {m.roles.length > 3 && <Badge>+{m.roles.length - 3}</Badge>}
                        </div>
                      </td>
                      <td>{m.joinedAt ? relative(m.joinedAt) : "Unavailable"}</td>
                      <td>
                        <Badge tone={m.timeoutUntil ? "warning" : "neutral"}>
                          {m.timeoutUntil ? "Timed out" : m.bot ? "Bot" : "Member"}
                        </Badge>
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`View ${m.name}`}
                          onClick={() => setProfile(m.id)}
                        >
                          <ChevronRight size={15} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel-footer">
              <span>
                <Users size={13} style={{ display: "inline", marginRight: 6 }} />
                {selected.length} selected · Search queries Discord directly
              </span>
              <div className="toolbar-group">
                {after && (
                  <Button size="sm" variant="ghost" onClick={() => setAfter("")}>
                    <ArrowLeft size={12} />
                    First page
                  </Button>
                )}
                {members.data?.after && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setAfter(members.data!.after!)}
                  >
                    Next 50 <ChevronRight size={12} />
                  </Button>
                )}
              </div>
            </div>
          </>
        ) : (
          <Empty
            title="No familiar faces here yet"
            description="Try a different name or role filter."
          />
        )}
      </section>
      <Dialog
        open={!!profile}
        onOpenChange={(v) => {
          if (!v) setProfile("");
        }}
      >
        <DialogContent className="dialog-wide">
          <DialogTitle>{detail.data?.member.name ?? "Member profile"}</DialogTitle>
          <DialogDescription>
            Server roles, local XP, and moderation history. Moderator notes are visible only to
            authorized moderation staff.
          </DialogDescription>
          {detail.isPending ? (
            <Loading />
          ) : detail.error ? (
            <Failure error={detail.error} />
          ) : (
            detail.data && (
              <>
                <div className="toolbar">
                  <div className="toolbar-group">
                    <code>{profile}</code>
                    <Badge tone="purple">{detail.data.xp.toLocaleString()} XP</Badge>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setActionIds([profile]);
                      setProfile("");
                      setActionOpen(true);
                    }}
                  >
                    Take an action <ArrowUpRight size={14} />
                  </Button>
                </div>
                <div className="role-list">
                  {detail.data.member.roles?.map((r) => (
                    <Badge key={r.id}>{r.name}</Badge>
                  ))}
                </div>
                <h3 className="section-spacer">Moderation history</h3>
                {detail.data.cases.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Case</th>
                          <th>Action</th>
                          <th>Reason</th>
                          <th>When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.data.cases.map((c) => (
                          <tr key={c.id}>
                            <td>#{c.caseNumber}</td>
                            <td>
                              <Badge tone={c.action.toLowerCase()}>{c.action}</Badge>
                            </td>
                            <td style={{ whiteSpace: "normal", minWidth: 180 }}>{c.reason}</td>
                            <td>{relative(c.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="A clean slate"
                    description="No moderation history has been recorded for this member."
                  />
                )}
              </>
            )
          )}
        </DialogContent>
      </Dialog>
      <ModerationDialog open={actionOpen} onOpenChange={setActionOpen} userIds={actionIds} />
    </>
  );
}
