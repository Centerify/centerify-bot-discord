"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { request } from "@/lib/client";
import { useWorkspace } from "./shell";
import { Badge, Heading, Notice } from "./shared";
import { Button } from "./ui/button";
export function AccountPage() {
  const { me, guild, notify } = useWorkspace(),
    client = useQueryClient(),
    [theme, setTheme] = useState(me.account?.theme ?? "dark"),
    [busy, setBusy] = useState(false);
  return (
    <>
      <Heading
        eyebrow="YOUR CORNER OF THE WORKSPACE"
        title="Make yourself comfortable."
        description="Your account, appearance, and connection details."
      />
      <div className="detail-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>A workspace that feels right</h2>
          </div>
          <div className="panel-body">
            <p className="inline-note">
              Dark is the default. Choose a theme for this account across dashboard sessions.
            </p>
            <div className="cards-grid section-spacer">
              {[
                { id: "dark", name: "Dark", icon: Moon },
                { id: "night", name: "Deeper night", icon: Moon },
                { id: "light", name: "Light", icon: Sun },
                { id: "system", name: "System", icon: Monitor },
              ].map((t) => (
                <button
                  key={t.id}
                  className="quick-action"
                  aria-pressed={theme === t.id}
                  style={{ borderColor: theme === t.id ? "var(--accent)" : undefined }}
                  onClick={() => {
                    setTheme(t.id as typeof theme);
                    document.documentElement.dataset.theme = t.id;
                  }}
                >
                  <t.icon size={20} />
                  <strong>
                    {t.name}{" "}
                    {theme === t.id && (
                      <Check size={12} style={{ display: "inline", marginLeft: 5 }} />
                    )}
                  </strong>
                </button>
              ))}
            </div>
            <div className="form-actions">
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await request("me", { theme });
                    await client.invalidateQueries({ queryKey: ["me"] });
                    notify("Appearance preference saved");
                  } catch (error) {
                    notify(
                      error instanceof Error ? error.message : "Could not save appearance",
                      "error",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save appearance
              </Button>
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <h2>Your Discord connection</h2>
            <Badge tone={me.user.demo ? "warning" : "success"}>
              {me.user.demo ? "Demo" : "Signed in"}
            </Badge>
          </div>
          <div className="panel-body">
            <dl className="detail-list">
              <div>
                <dt>Account</dt>
                <dd>{me.user.name}</dd>
              </div>
              <div>
                <dt>Discord ID</dt>
                <dd>
                  <code>{me.user.id}</code>
                </dd>
              </div>
              <div>
                <dt>Current server</dt>
                <dd>{guild.name}</dd>
              </div>
              <div>
                <dt>Session</dt>
                <dd>Up to 8 hours</dd>
              </div>
              <div>
                <dt>Granted scopes</dt>
                <dd>Identity · server list</dd>
              </div>
            </dl>
            <Notice>
              {me.user.demo
                ? "This isolated demo uses sample data in memory. Restarting the dashboard resets it. Set up Discord OAuth and the bot bridge to connect a real server."
                : "Permissions are checked against current Discord membership. Your bot token and OAuth credentials are kept on the server."}
            </Notice>
            <a
              className="text-link"
              href="https://discord.com/settings/authorized-apps"
              target="_blank"
              rel="noreferrer"
            >
              Review authorized Discord apps
            </a>
          </div>
        </section>
      </div>
    </>
  );
}
