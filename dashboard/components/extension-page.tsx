"use client";
import { useResource } from "@/lib/client";
import type { Plugins } from "@/lib/types";
import { useWorkspace } from "./shell";
import { Badge, Empty, Failure, Heading, Loading, Notice } from "./shared";
import { Button } from "./ui/button";
import Link from "next/link";
export function ExtensionPage({ pluginId, routeId }: { pluginId: string; routeId: string }) {
  const { guild, notify } = useWorkspace(),
    query = useResource<Plugins>(guild.id, "plugins");
  if (query.isPending) return <Loading />;
  if (query.error) return <Failure error={query.error} />;
  const extension = query.data.extensions.find((e) => e.id === pluginId),
    route = extension?.navigation.find((n) => n.id === routeId),
    activation = query.data.activations.find((a) => a.pluginId === pluginId);
  if (!extension || !route || !activation?.enabled)
    return (
      <Empty
        title="This extension isn’t active here"
        description="An operator must install the package, then a server administrator must explicitly enable it for this server."
      >
        <Button asChild variant="secondary">
          <Link href="/plugins">Open plugins</Link>
        </Button>
      </Empty>
    );
  return (
    <>
      <Heading
        eyebrow="YOUR COMMUNITY EXTENSIONS"
        title={route.label}
        description={extension.description}
      >
        <Badge tone="success">
          {extension.name} · v{extension.version}
        </Badge>
      </Heading>
      {extension.widgets.map((widget) => (
        <section className="panel section-spacer" key={widget.id}>
          <div className="panel-header">
            <h2>{widget.title}</h2>
          </div>
          <div className="panel-body">
            <p>{widget.description}</p>
            <div className="checklist">
              <Link href="/settings">Set up your welcome and roles</Link>
              <Link href="/builder">Build a greeting workflow</Link>
            </div>
          </div>
        </section>
      ))}
      {extension.themes.length > 0 && (
        <section className="panel section-spacer">
          <div className="panel-header">
            <h2>Make it a little more you</h2>
          </div>
          <div className="panel-body toolbar-group">
            {extension.themes.map((theme) => (
              <Button
                variant="secondary"
                key={theme.id}
                onClick={() => {
                  if (!/^#[a-fA-F0-9]{6}$/.test(theme.accent)) return;
                  document.documentElement.style.setProperty("--accent", theme.accent);
                  localStorage.setItem(`centerify-accent:${guild.id}`, theme.accent);
                  notify("Extension accent applied to this browser");
                }}
              >
                <span
                  style={{ background: theme.accent, width: 12, height: 12, borderRadius: "50%" }}
                />
                {theme.id} accent
              </Button>
            ))}
            <Button
              variant="ghost"
              onClick={() => {
                document.documentElement.style.removeProperty("--accent");
                localStorage.removeItem(`centerify-accent:${guild.id}`);
              }}
            >
              Use default accent
            </Button>
          </div>
        </section>
      )}
      <Notice>
        Extension UI is rendered from the validated manifest. No uploaded plugin script is executed
        in your browser.
      </Notice>
    </>
  );
}
