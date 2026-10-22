"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Highlight } from "@animate-ui/react/primitives/effects/highlight";
import {
  Activity,
  ArrowUpRight,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Command,
  Compass,
  ExternalLink,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings2,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Ticket,
  Users,
  Zap,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { request, RequestError, useResource } from "@/lib/client";
import type { Capability, Event, Guild, Me, Plugins } from "@/lib/types";
import { relative } from "@/lib/utils";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "./ui/menu";
import { Badge, Empty, Failure, Loading, SearchInput } from "./shared";
const navigation = [
  { label: "Overview", href: "/", icon: LayoutDashboard, cap: "overview" },
  { label: "Members", href: "/members", icon: Users, cap: "moderation" },
  { label: "Moderation", href: "/moderation", icon: Shield, cap: "moderation" },
  { label: "Tickets", href: "/tickets", icon: Ticket, cap: "tickets" },
  { label: "Commands & aliases", href: "/commands", icon: Command, cap: "commands" },
  { label: "Command builder", href: "/builder", icon: GitBranch, cap: "commands" },
  { label: "Plugins", href: "/plugins", icon: Zap, cap: "plugins" },
  { label: "Server settings", href: "/settings", icon: Settings2, cap: "settings" },
  { label: "Activity & audit", href: "/audit", icon: Activity, cap: "settings" },
] as const;
interface Workspace {
  me: Me;
  guild: Guild;
  connection: string;
  notify(message: string, tone?: "success" | "error"): void;
}
const WorkspaceContext = createContext<Workspace | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace is not ready");
  return value;
}
export function Can({
  capability,
  children,
}: {
  capability: Capability;
  children: React.ReactNode;
}) {
  const { guild } = useWorkspace();
  return guild.capabilities.includes(capability) ? (
    children
  ) : (
    <Empty
      title="This page needs additional permissions"
      description={`Your Discord account needs ${capability} access in this server. Ask a server administrator to review your permissions.`}
    />
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(),
    router = useRouter(),
    queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => request<Me>("me"),
    retry: false,
    staleTime: 60000,
  });
  const [guildId, setGuildId] = useState(""),
    [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [search, setSearch] = useState(""),
    [connection, setConnection] = useState("Connecting"),
    [notifications, setNotifications] = useState<Event[]>([]),
    [toast, setToast] = useState<{ message: string; tone: string } | null>(null),
    [theme, setTheme] = useState("dark"),
    [seen, setSeen] = useState(0);
  const notify = useCallback(
    (message: string, tone: "success" | "error" = "success") => setToast({ message, tone }),
    [],
  );
  const me = meQuery.data,
    guild =
      me?.guilds.find((g) => g.id === guildId) ??
      me?.guilds.find((g) => g.installed) ??
      me?.guilds[0];
  const pluginQuery = useResource<Plugins>(
    guild?.id ?? "",
    "plugins",
    Boolean(guild?.installed && guild.capabilities.includes("plugins")),
  );
  const activeExtensions =
    pluginQuery.data?.extensions.filter((extension) =>
      pluginQuery.data?.activations.some((a) => a.pluginId === extension.id && a.enabled),
    ) ?? [];
  useEffect(() => {
    const accent = localStorage.getItem(`centerify-accent:${guild?.id}`);
    if (accent && activeExtensions.some((e) => e.themes.some((t) => t.accent === accent)))
      document.documentElement.style.setProperty("--accent", accent);
    else document.documentElement.style.removeProperty("--accent");
  }, [guild?.id, pluginQuery.data]);
  useEffect(() => {
    const saved = localStorage.getItem("centerify-guild");
    if (saved) setGuildId(saved);
    setCollapsed(localStorage.getItem("centerify-collapsed") === "true");
  }, []);
  useEffect(() => {
    if (me) {
      setTheme(me.account?.theme ?? "dark");
    }
  }, [me]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("centerify-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (meQuery.error instanceof RequestError && meQuery.error.status === 401)
      router.replace("/login");
  }, [meQuery.error, router]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!guild?.installed) return;
    const id = guild.id,
      key = `centerify-cursor:${id}`,
      cursor = sessionStorage.getItem(key) ?? "0";
    let stopped = false;
    setNotifications([]);
    setConnection("Connecting");
    const stream = new EventSource(`/api/events?guildId=${id}&cursor=${cursor}`);
    stream.onopen = () => {
      if (!stopped) {
        setConnection("Live");
        void queryClient.invalidateQueries({ queryKey: ["guild", id] });
      }
    };
    stream.onerror = () => {
      if (!stopped) setConnection("Reconnecting");
    };
    stream.addEventListener("update", (event) => {
      const e = JSON.parse((event as MessageEvent).data) as Event;
      const last = Number(sessionStorage.getItem(key) ?? 0);
      if (e.id <= last) return;
      sessionStorage.setItem(key, String(e.id));
      setNotifications((current) => [e, ...current].slice(0, 20));
      void queryClient.invalidateQueries({ queryKey: ["guild", id] });
    });
    stream.addEventListener("reset", () => {
      sessionStorage.removeItem(key);
      void queryClient.invalidateQueries({ queryKey: ["guild", id] });
    });
    stream.addEventListener("expired", () => {
      stream.close();
      setConnection("Session expired");
      notify("Your access changed or your session expired. Sign in again.", "error");
    });
    stream.addEventListener("disconnected", () => setConnection("Bot disconnected"));
    return () => {
      stopped = true;
      stream.close();
    };
  }, [guild?.id, guild?.installed, queryClient, notify]);
  async function logout() {
    if (me?.user.demo) {
      await fetch("/api/demo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      window.location.href = "/login";
    } else await signOut({ callbackUrl: "/login" });
  }
  async function updateTheme(next: string) {
    setTheme(next);
    try {
      await request("me", { theme: next });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Theme could not be saved", "error");
    }
  }
  function switchGuild(id: string) {
    setGuildId(id);
    localStorage.setItem("centerify-guild", id);
    setMobile(false);
    router.push("/");
  }
  const current = navigation.find((n) => n.href === pathname),
    unread = notifications.filter((n) => n.id > seen).length;
  const sidebar = (
    <>
      <Link href="/" className="brand" aria-label="Centerify overview">
        <span className="brand-mark">
          <span />
        </span>
        <span className="brand-name">
          centerify<span className="brand-dot">.</span>
        </span>
      </Link>
      <div className="workspace-caption">YOUR WORKSPACE</div>
      <Menu>
        <MenuTrigger asChild>
          <button className="server-switcher">
            <span className="server-avatar">
              {guild?.name.slice(0, 1) ?? "C"}
              <span />
            </span>
            <span className="server-switcher-text">
              <strong>{guild?.name ?? "Choose a server"}</strong>
              <small>Discord community</small>
            </span>
            <ChevronDown size={15} />
          </button>
        </MenuTrigger>
        <MenuContent align="start">
          <div className="menu-label">Your servers</div>
          {me?.guilds.map((g) => (
            <MenuItem key={g.id} onSelect={() => switchGuild(g.id)}>
              <span className="mini-avatar">{g.name[0]}</span>
              <span>
                {g.name}
                <small>{g.installed ? "Centerify installed" : "Installation required"}</small>
              </span>
              {guild?.id === g.id && <Check size={15} />}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
      <nav aria-label="Main navigation">
        <div className="nav-caption">COMMUNITY</div>
        <Highlight value={pathname} className="nav-highlight">
          {navigation
            .slice(0, 4)
            .filter((n) => guild?.capabilities.includes(n.cap))
            .map((n) => (
              <Link
                key={n.href}
                href={n.href}
                data-value={n.href}
                aria-current={pathname === n.href ? "page" : undefined}
                onClick={() => setMobile(false)}
                className={`nav-item ${pathname === n.href ? "active" : ""}`}
              >
                <n.icon size={18} />
                <span>{n.label}</span>
                {n.href === "/tickets" && <span className="nav-dot" />}
              </Link>
            ))}
        </Highlight>
        <div className="nav-caption">WORKSPACE</div>
        {navigation
          .slice(4)
          .filter((n) => guild?.capabilities.includes(n.cap))
          .map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={pathname === n.href ? "page" : undefined}
              onClick={() => setMobile(false)}
              className={`nav-item ${pathname === n.href ? "active" : ""}`}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.href === "/builder" && <span className="nav-new">NEW</span>}
            </Link>
          ))}
        {activeExtensions.flatMap((extension) =>
          extension.navigation.map((route) => (
            <Link
              key={`${extension.id}:${route.id}`}
              href={`/extensions/${extension.id}/${route.id}`}
              className={`nav-item ${pathname === `/extensions/${extension.id}/${route.id}` ? "active" : ""}`}
              onClick={() => setMobile(false)}
            >
              <Zap size={18} />
              <span>{route.label}</span>
            </Link>
          )),
        )}
      </nav>
      <div className="sidebar-bottom">
        <div className="community-card">
          <Sparkles size={20} />
          <strong>A little more possibility.</strong>
          <p>Make Centerify your own with community extensions.</p>
          <Link href="/plugins">
            Explore plugins <ArrowUpRight size={14} />
          </Link>
        </div>
        <a
          className="nav-item"
          href="https://github.com/Centerify/centerify-bot-discord/tree/main/docs"
          target="_blank"
          rel="noreferrer"
        >
          <BookOpen size={17} />
          <span>Documentation</span>
          <ExternalLink size={13} />
        </a>
        <button
          className="collapse-button"
          onClick={() => {
            setCollapsed(!collapsed);
            localStorage.setItem("centerify-collapsed", String(!collapsed));
          }}
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          <span>Collapse sidebar</span>
        </button>
      </div>
    </>
  );
  if (meQuery.isPending)
    return (
      <div className="full-state">
        <Loading />
      </div>
    );
  if (meQuery.error)
    return (
      <div className="full-state">
        <Failure error={meQuery.error} retry={() => void meQuery.refetch()} />
        <Button variant="ghost" onClick={() => void logout()}>
          Return to sign in
        </Button>
      </div>
    );
  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">{sidebar}</aside>
      <Dialog open={mobile} onOpenChange={setMobile}>
        <DialogContent className="mobile-sidebar">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a server and dashboard page.
          </DialogDescription>
          {sidebar}
        </DialogContent>
      </Dialog>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumbs">
            <Button
              size="icon"
              variant="ghost"
              className="mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <MenuIcon size={20} />
            </Button>
            <span className="breadcrumb-server">Workspace</span>
            <ChevronRight size={13} />
            <strong>{current?.label ?? "Account"}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="global-search"
              aria-label="Search anything"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={15} />
              <span>Search anything…</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className={`live-status ${connection !== "Live" ? "offline" : ""}`}>
              <i />
              {me?.user.demo ? "Demo workspace" : connection}
            </span>
            <Menu>
              <MenuTrigger asChild>
                <button
                  className="notification-button"
                  aria-label={`Notifications, ${unread} unread`}
                  onClick={() => setSeen(notifications[0]?.id ?? seen)}
                >
                  <Bell size={19} />
                  {unread > 0 && <i />}
                </button>
              </MenuTrigger>
              <MenuContent align="end" className="notifications-menu">
                <div className="menu-label">
                  Recent activity <Badge>{notifications.length}</Badge>
                </div>
                {notifications.length ? (
                  notifications.slice(0, 6).map((e) => (
                    <MenuItem key={e.id} onSelect={() => router.push("/audit")}>
                      <Activity size={16} />
                      <span>
                        {e.summary}
                        <small>{relative(e.createdAt)}</small>
                      </span>
                    </MenuItem>
                  ))
                ) : (
                  <p className="menu-empty">You’re all caught up. New activity will appear here.</p>
                )}
              </MenuContent>
            </Menu>
            <Menu>
              <MenuTrigger asChild>
                <button className="account-avatar" aria-label="Account menu">
                  {me?.user.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </button>
              </MenuTrigger>
              <MenuContent align="end">
                <div className="menu-label">
                  {me?.user.name}
                  <small>{me?.user.demo ? "Demo account" : "Discord account"}</small>
                </div>
                <MenuItem onSelect={() => router.push("/account")}>
                  <SlidersHorizontal size={16} />
                  Account settings
                </MenuItem>
                <MenuSeparator className="menu-separator" />
                {[
                  ["dark", "Dark"],
                  ["night", "Deeper night"],
                  ["light", "Light"],
                  ["system", "System"],
                ].map(([value, label]) => (
                  <MenuItem key={value} onSelect={() => void updateTheme(value!)}>
                    {value === "light" ? <Sun size={16} /> : <Moon size={16} />}
                    <span>{label}</span>
                    {theme === value && <Check size={15} />}
                  </MenuItem>
                ))}
                <MenuSeparator className="menu-separator" />
                <MenuItem onSelect={() => void logout()}>
                  <LogOut size={16} />
                  Sign out
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </header>
        {me?.user.demo && (
          <div className="demo-ribbon">
            <Compass size={14} />
            <strong>Demo mode</strong>
            <span>
              Illustrative data. Actions are simulated and scoped to this browser session.
            </span>
            <Link href="/account">
              Connection details <ArrowUpRight size={13} />
            </Link>
          </div>
        )}
        <main id="main-content" className="page-content">
          {!guild ? (
            <Empty
              title="Your next community starts here"
              description="You need a server you can manage, or a moderation or ticket support role in a server with Centerify installed."
            />
          ) : !guild.installed ? (
            <Empty
              title={`Bring Centerify to ${guild.name}`}
              description="Install the bot, grant the permissions your modules need, and run /verify as the server owner."
            >
              {me?.installUrl ? (
                <Button asChild>
                  <a
                    href={`${me.installUrl}&guild_id=${guild.id}&disable_guild_select=true`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Add to Discord <Plus size={16} />
                  </a>
                </Button>
              ) : (
                <Badge tone="warning">
                  A real Discord application is required to install the bot
                </Badge>
              )}
            </Empty>
          ) : (
            <WorkspaceContext.Provider value={{ me: me!, guild, connection, notify }}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${guild.id}:${pathname}`}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </WorkspaceContext.Provider>
          )}
        </main>
        <footer className="workspace-footer">
          <span>
            <span className="tiny-mark" /> A calmer place to manage your community.
          </span>
          <span>
            Centerify <span className="footer-version">v1.0</span>
          </span>
        </footer>
      </div>
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="search-dialog">
          <DialogTitle>Find your way</DialogTitle>
          <DialogDescription>Search pages and tools in your workspace.</DialogDescription>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search pages, tools, and settings…"
          />
          <div className="search-results">
            {navigation
              .filter(
                (n) =>
                  guild?.capabilities.includes(n.cap) &&
                  n.label.toLowerCase().includes(search.toLowerCase()),
              )
              .map((n) => (
                <button
                  key={n.href}
                  onClick={() => {
                    router.push(n.href);
                    setSearchOpen(false);
                    setSearch("");
                  }}
                >
                  <n.icon size={18} />
                  <span>{n.label}</span>
                  <ChevronRight size={16} />
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`toast toast-${toast.tone}`}
            role={toast.tone === "error" ? "alert" : "status"}
          >
            {toast.tone === "success" ? <Check size={17} /> : <Shield size={17} />}
            <span>{toast.message}</span>
            <button aria-label="Dismiss notification" onClick={() => setToast(null)}>
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
