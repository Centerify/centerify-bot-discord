"use client";
import Link from "next/link";
import { useState } from "react";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Command,
  GitBranch,
  Heart,
  Plus,
  Radio,
  Shield,
  Sparkles,
  Ticket,
  Users,
  UserPlus,
} from "lucide-react";
import { useResource } from "@/lib/client";
import type { Overview, Plugins, Ticket as TicketType } from "@/lib/types";
import { relative } from "@/lib/utils";
import { useWorkspace } from "./shell";
import { Badge, Failure, Heading, Loading, Notice } from "./shared";
import { Button } from "./ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "./ui/menu";
export function OverviewPage() {
  const { guild, me, connection } = useWorkspace(),
    [days, setDays] = useState("7");
  const overview = useResource<Overview>(guild.id, `overview?days=${days}`),
    tickets = useResource<TicketType[]>(
      guild.id,
      "tickets",
      guild.capabilities.includes("tickets"),
    ),
    plugins = useResource<Plugins>(guild.id, "plugins", guild.capabilities.includes("plugins"));
  if (overview.isPending) return <Loading />;
  if (overview.error)
    return <Failure error={overview.error} retry={() => void overview.refetch()} />;
  const data = overview.data,
    openTickets = tickets.data?.filter((t) => t.state === "open").length;
  const trend = (current: number, previous: number) =>
    previous ? Math.round(((current - previous) / previous) * 100) : null;
  const stats = [
    {
      label: "Total members",
      value: data.guild.memberCount,
      icon: Users,
      trend: null,
      note: "People who make this place",
      href: "/members",
    },
    {
      label: "Members joined",
      value: data.stats.joins,
      icon: UserPlus,
      trend: trend(data.stats.joins, data.stats.joinsPrevious),
      note: `vs previous ${days} days`,
      href: "/members",
    },
    {
      label: "Commands used",
      value: data.stats.commands,
      icon: Command,
      trend: trend(data.stats.commands, data.stats.commandsPrevious),
      note: `vs previous ${days} days`,
      href: "/commands",
    },
    {
      label: "Moderation actions",
      value: data.stats.moderation,
      icon: Shield,
      trend: trend(data.stats.moderation, data.stats.moderationPrevious),
      note: `vs previous ${days} days`,
      href: "/moderation",
    },
  ];
  const enabledPlugins = plugins.data?.activations.filter((p) => p.enabled) ?? [];
  const widgets =
    plugins.data?.extensions
      .filter((e) => enabledPlugins.some((p) => p.pluginId === e.id))
      .flatMap((e) => e.widgets) ?? [];
  return (
    <>
      <Heading
        eyebrow={`YOUR COMMUNITY, AT A GLANCE`}
        title={`A good day to connect, ${me.user.name.split(" ")[0]}.`}
        description={`Here’s what’s happening in ${guild.name}.`}
      >
        <select
          className="select-compact"
          aria-label="Analytics date range"
          value={days}
          onChange={(e) => setDays(e.target.value)}
        >
          <option value="7">Last 7 days</option>
          <option value="14">Last 14 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
        <Menu>
          <MenuTrigger asChild>
            <Button>
              <Plus size={15} />
              Quick action <ChevronRight size={13} />
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            {guild.capabilities.includes("commands") && (
              <>
                <MenuItem asChild>
                  <Link href="/builder">
                    <GitBranch size={16} />
                    Create a workflow
                  </Link>
                </MenuItem>
                <MenuItem asChild>
                  <Link href="/commands">
                    <Command size={16} />
                    Manage custom commands
                  </Link>
                </MenuItem>
              </>
            )}
            {guild.capabilities.includes("moderation") && (
              <MenuItem asChild>
                <Link href="/moderation">
                  <Shield size={16} />
                  Record a moderation action
                </Link>
              </MenuItem>
            )}
            {guild.capabilities.includes("tickets") && (
              <MenuItem asChild>
                <Link href="/tickets">
                  <Ticket size={16} />
                  Open ticket inbox
                </Link>
              </MenuItem>
            )}
          </MenuContent>
        </Menu>
      </Heading>
      <div className="status-banner">
        <div className="status-banner-copy">
          <div className="status-icon">
            <Radio size={22} />
          </div>
          <div>
            <h2>
              Centerify is {data.health.connected ? "right here with you" : "reconnecting"}.{" "}
              <Badge tone={data.health.connected ? "success" : "warning"}>
                {me.user.demo
                  ? "Demo status"
                  : data.health.connected
                    ? "All connected"
                    : "Disconnected"}
              </Badge>
            </h2>
            <p>
              {data.verified
                ? "Your community is connected. Let’s keep things running smoothly."
                : "The server owner needs to run /verify in Discord before making changes."}
            </p>
          </div>
        </div>
        <div className="status-banner-meta">
          <span>
            Latency <strong>{data.health.latencyMs} ms</strong>
          </span>
          <span>
            Uptime{" "}
            <strong>
              {Math.floor(data.health.uptimeMs / 86400000)}d{" "}
              {Math.floor(data.health.uptimeMs / 3600000) % 24}h
            </strong>
          </span>
        </div>
      </div>
      {!data.verified && (
        <Notice tone="warning">
          Server ownership is not verified. Run <code>/verify</code> as the server owner to unlock
          changes.
        </Notice>
      )}
      {connection !== "Live" && !me.user.demo && (
        <Notice tone="warning">
          {connection}. Data may be stale; updates resume when the connection recovers.
        </Notice>
      )}
      <div className="stat-grid">
        {stats.map((s) => (
          <Link href={s.href} className="stat-card" key={s.label}>
            <div className="stat-label">
              {s.label}
              <s.icon size={17} />
            </div>
            <div className="stat-value">{s.value.toLocaleString()}</div>
            <div className="stat-footnote">
              {s.trend !== null && (
                <span className={`stat-trend ${s.trend < 0 ? "negative" : ""}`}>
                  {s.trend < 0 ? <ArrowDownRight size={11} /> : <ArrowUpRight size={11} />}{" "}
                  {Math.abs(s.trend)}%
                </span>
              )}
              <span>{s.note}</span>
            </div>
          </Link>
        ))}
      </div>
      <div className="overview-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>The rhythm of your community</h2>
              <p>Command activity and new connections, day by day.</p>
            </div>
            <div className="chart-legend">
              <span>
                <i style={{ background: "var(--accent)" }} />
                Commands
              </span>
              <span>
                <i style={{ background: "var(--green)" }} />
                Joins
              </span>
            </div>
          </div>
          <div
            className="chart-container"
            role="img"
            aria-label={`Daily command usage and member joins over the last ${days} days. A data table is available below.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.series} margin={{ top: 15, right: 23, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="command-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(v) =>
                    new Date(`${v}T12:00:00Z`).toLocaleDateString("en", {
                      month: "short",
                      day: "numeric",
                    })
                  }
                  tick={{ fill: "var(--subtle)", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  dy={10}
                  minTickGap={25}
                />
                <YAxis
                  tick={{ fill: "var(--subtle)", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  width={45}
                />
                <Tooltip />
                <Area
                  type="monotone"
                  name="Commands"
                  dataKey="commands"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  fill="url(#command-fill)"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  name="Joins"
                  dataKey="joins"
                  stroke="var(--green)"
                  strokeWidth={1.6}
                  strokeDasharray="4 4"
                  fill="transparent"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-caption">
            {data.collection.note}
            {data.collection.capped &&
              " The selected period exceeds 10,000 recorded events; counts are capped."}
          </div>
          <details className="chart-caption">
            <summary>View accessible data table</summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Commands</th>
                    <th>Joins</th>
                    <th>Leaves</th>
                  </tr>
                </thead>
                <tbody>
                  {data.series.map((row) => (
                    <tr key={row.day}>
                      <td>{row.day}</td>
                      <td>{row.commands}</td>
                      <td>{row.joins}</td>
                      <td>{row.leaves}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
        <section className="panel">
          <div className="panel-header">
            <h2>Little moments, lately</h2>
            <Activity size={16} style={{ color: "var(--subtle)" }} />
          </div>
          {data.events.length ? (
            data.events.slice(0, 5).map((e) => (
              <Link
                href={
                  e.type.startsWith("ticket")
                    ? "/tickets"
                    : e.type.startsWith("moderation")
                      ? "/moderation"
                      : e.type.startsWith("command")
                        ? "/commands"
                        : "/audit"
                }
                className="activity-item"
                key={e.id}
              >
                <span
                  className={`event-icon ${e.type.startsWith("member") ? "green" : e.type.startsWith("ticket") ? "orange" : ""}`}
                >
                  {e.type.startsWith("member") ? (
                    <UserPlus size={14} />
                  ) : e.type.startsWith("ticket") ? (
                    <Ticket size={14} />
                  ) : e.type.startsWith("moderation") ? (
                    <Shield size={14} />
                  ) : (
                    <Command size={14} />
                  )}
                </span>
                <div className="activity-copy">
                  <p>{e.summary}</p>
                  <small>{e.type.replaceAll(".", " · ")}</small>
                </div>
                <span>{relative(e.createdAt)}</span>
              </Link>
            ))
          ) : (
            <div className="state">
              <p>Your community’s next moments will appear here.</p>
            </div>
          )}
          <div className="panel-footer">
            <span>Updated as your community moves</span>
            <Link href="/audit" className="text-link">
              All activity <ArrowUpRight size={12} />
            </Link>
          </div>
        </section>
      </div>
      <div className="overview-bottom">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>A few good places to start</h2>
              <p>Small actions that make a big difference.</p>
            </div>
            <Sparkles size={17} style={{ color: "var(--accent)" }} />
          </div>
          <div className="quick-grid">
            {[
              {
                href: "/tickets",
                icon: Ticket,
                title: "Lend a hand",
                description:
                  openTickets !== undefined
                    ? `${openTickets} open support conversations`
                    : "Check your support inbox",
                cap: "tickets",
              },
              {
                href: "/builder",
                icon: GitBranch,
                title: "Build something",
                description: "Turn a good idea into a workflow",
                cap: "commands",
              },
              {
                href: "/settings",
                icon: Heart,
                title: "Make it yours",
                description: "A warm welcome and the little details",
                cap: "settings",
              },
            ]
              .filter((a) =>
                guild.capabilities.includes(a.cap as "tickets" | "commands" | "settings"),
              )
              .map((a) => (
                <Link className="quick-action" href={a.href} key={a.href}>
                  <a.icon />
                  <strong>{a.title}</strong>
                  <small>{a.description}</small>
                </Link>
              ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <h2>Behind the scenes</h2>
            <Badge tone="success">
              {data.health.modules.filter((m) => m.enabled).length} modules enabled
            </Badge>
          </div>
          {data.health.modules
            .filter((m) => ["moderation", "tickets", "custom-commands"].includes(m.id))
            .map((m) => (
              <Link
                href={m.id === "custom-commands" ? "/commands" : `/${m.id}`}
                key={m.id}
                className="module-row"
              >
                <span className="module-row-name">
                  {m.id === "moderation" ? (
                    <Shield size={15} />
                  ) : m.id === "tickets" ? (
                    <Ticket size={15} />
                  ) : (
                    <Command size={15} />
                  )}
                  <span style={{ textTransform: "capitalize" }}>{m.name}</span>
                </span>
                <Badge tone={m.enabled ? "success" : "neutral"}>
                  {m.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </Link>
            ))}
          <div className="panel-footer">
            <span>Gateway latency: {data.health.latencyMs} ms</span>
            <Link href="/plugins" className="text-link">
              Modules & plugins <ArrowUpRight size={12} />
            </Link>
          </div>
        </section>
      </div>
      {widgets.map((widget) => (
        <section className="panel section-spacer" key={widget.id}>
          <div className="panel-header">
            <div>
              <h2>{widget.title}</h2>
              <p>{widget.description}</p>
            </div>
            <Badge tone="purple">Community Kit</Badge>
          </div>
          <div className="checklist">
            <Link href="/settings">
              <Check size={15} />
              Set up a welcome message <ArrowUpRight size={12} />
            </Link>
            <Link href="/builder">
              <GitBranch size={15} />
              Create a greeting workflow <ArrowUpRight size={12} />
            </Link>
          </div>
        </section>
      ))}
    </>
  );
}
