"use client";
import { useState } from "react";
import { ArrowUpRight, Check, Code2, Package, Settings2, Shield, Zap } from "lucide-react";
import { useAction, useResource } from "@/lib/client";
import type { ExtensionManifest, Plugins } from "@/lib/types";
import { useWorkspace } from "./shell";
import { Badge, Empty, Failure, Heading, Loading, Notice, SearchInput } from "./shared";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
export function PluginsPage() {
  const { guild, notify } = useWorkspace(),
    [tab, setTab] = useState("extensions"),
    [q, setQ] = useState(""),
    [selected, setSelected] = useState<ExtensionManifest | null>(null),
    [settings, setSettings] = useState(""),
    [operator, setOperator] = useState(""),
    [error, setError] = useState("");
  const query = useResource<Plugins>(guild.id, "plugins"),
    action = useAction(guild.id, "plugins");
  return (
    <>
      <Heading
        eyebrow="A LITTLE MORE POSSIBILITY"
        title="Make room for your next idea."
        description="Trusted extensions that bring new tools, workflows, and personality to your community."
      >
        <Button variant="secondary" onClick={() => setOperator("operator-guide")}>
          <Code2 size={14} />
          Operator guide
        </Button>
      </Heading>
      <div className="toolbar">
        <div
          className="tabs"
          style={{ margin: 0, border: 0 }}
          role="tablist"
          aria-label="Plugin catalog"
        >
          {[
            ["extensions", "Dashboard extensions"],
            ["installed", "Installed packages"],
            ["available", "Available packages"],
          ].map(([id, label]) => (
            <button
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "active" : ""}
              key={id}
              onClick={() => setTab(id!)}
            >
              {label}
            </button>
          ))}
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Find an extension…" />
      </div>
      {query.isPending ? (
        <Loading label="Discovering your extensions" />
      ) : query.error ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          {tab === "extensions" ? (
            <div className="cards-grid">
              {query.data.extensions.length === 0 && (
                <div className="panel" style={{ gridColumn: "1 / -1" }}>
                  <Empty
                    title="A clean slate, by default"
                    description="No plugins are installed or activated automatically. Explore available packages, ask an authorized operator to install one, then choose whether to enable it for this server."
                  >
                    <Button variant="secondary" onClick={() => setTab("available")}>
                      Explore available packages
                    </Button>
                  </Empty>
                </div>
              )}
              {query.data.extensions
                .filter((e) => `${e.name} ${e.description}`.toLowerCase().includes(q.toLowerCase()))
                .map((ext) => {
                  const activation = query.data.activations.find((a) => a.pluginId === ext.id);
                  return (
                    <section className="panel plugin-card" key={ext.id}>
                      <div className="plugin-card-top">
                        <span className="plugin-logo">
                          <Zap size={23} />
                        </span>
                        <div>
                          <h3>{ext.name}</h3>
                          <small>
                            v{ext.version} · Dashboard API {ext.dashboardApi}
                          </small>
                        </div>
                      </div>
                      <p>{ext.description}</p>
                      <div className="capabilities">
                        {ext.capabilities.map((c) => (
                          <Badge key={c}>{c.replaceAll(".", " · ")}</Badge>
                        ))}
                      </div>
                      <div className="plugin-card-footer">
                        <Badge tone={activation?.enabled ? "success" : "neutral"}>
                          {activation?.enabled ? "Active in this server" : "Inactive"}
                        </Badge>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSelected(ext);
                            setSettings(JSON.stringify(activation?.config ?? {}, null, 2));
                            setError("");
                            action.reset();
                          }}
                        >
                          <Settings2 size={13} />
                          Configure
                        </Button>
                      </div>
                    </section>
                  );
                })}
            </div>
          ) : tab === "installed" ? (
            Object.values(query.data.installed.plugins).length ? (
              <div className="cards-grid">
                {Object.values(query.data.installed.plugins)
                  .filter((p) => p.manifest.name.toLowerCase().includes(q.toLowerCase()))
                  .map((plugin) => (
                    <section className="panel plugin-card" key={plugin.manifest.id}>
                      <div className="plugin-card-top">
                        <span className="plugin-logo">
                          <Package size={22} />
                        </span>
                        <div>
                          <h3>{plugin.manifest.name}</h3>
                          <small>Global package · v{plugin.manifest.version}</small>
                        </div>
                      </div>
                      <Badge tone={plugin.enabled ? "success" : "neutral"}>
                        {plugin.enabled ? "Enabled globally" : "Disabled globally"}
                      </Badge>
                      <div className="capabilities">
                        {plugin.manifest.permissions.map((p) => (
                          <Badge key={p}>{p}</Badge>
                        ))}
                      </div>
                      <div className="plugin-card-footer">
                        <small>Restart required for code changes</small>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setOperator(plugin.manifest.id)}
                        >
                          Manage package
                        </Button>
                      </div>
                    </section>
                  ))}
              </div>
            ) : (
              <section className="panel">
                <Empty
                  title="A thoughtful foundation"
                  description="No plugins are installed by default. An authorized operator can install an optional package from the available catalog, then a server administrator can activate its features."
                />
              </section>
            )
          ) : (
            <div className="cards-grid">
              {query.data.catalog
                .filter((e) => e.manifest.name.toLowerCase().includes(q.toLowerCase()))
                .map((p) => (
                  <section className="panel plugin-card" key={p.manifest.id}>
                    <div className="plugin-card-top">
                      <span className="plugin-logo">
                        <Package size={22} />
                      </span>
                      <div>
                        <h3>{p.manifest.name}</h3>
                        <small>v{p.manifest.version}</small>
                      </div>
                    </div>
                    <p>{p.manifest.description}</p>
                    <div className="capabilities">
                      {p.manifest.permissions.map((c) => (
                        <Badge key={c}>{c}</Badge>
                      ))}
                    </div>
                    <div className="plugin-card-footer">
                      <Badge>Trusted catalog</Badge>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setOperator(p.manifest.id)}
                      >
                        Installation details <ArrowUpRight size={12} />
                      </Button>
                    </div>
                  </section>
                ))}
            </div>
          )}
          <Notice>
            <Shield size={14} />
            {query.data.installation} Guild administrators can activate registered extensions.
            Third-party packages run in the bot process and must be trusted; this is not a security
            sandbox.
          </Notice>
        </>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogTitle>{selected?.name}</DialogTitle>
          <DialogDescription>
            Configure this extension and its activation for {guild.name}. The package’s global
            installation is separate.
          </DialogDescription>
          {selected && (
            <>
              <p className="inline-note">
                Compatibility: Dashboard API {selected.dashboardApi} · Dependencies:{" "}
                {selected.dependencies.join(", ")}
              </p>
              <div className="capabilities section-spacer">
                {selected.capabilities.map((c) => (
                  <Badge key={c}>{c}</Badge>
                ))}
              </div>
              <label className="section-spacer">
                Plugin settings
                <textarea
                  className="code-editor"
                  style={{ minHeight: 130 }}
                  value={settings}
                  onChange={(e) => setSettings(e.target.value)}
                  spellCheck={false}
                />
              </label>
              {(error || action.error) && (
                <Notice tone="error">{error || action.error?.message}</Notice>
              )}
              <div className="form-actions">
                {query.data?.activations.find((a) => a.pluginId === selected.id)?.enabled && (
                  <Button
                    variant="secondary"
                    disabled={action.isPending}
                    onClick={() => {
                      const activation = query.data!.activations.find(
                        (a) => a.pluginId === selected.id,
                      )!;
                      action.mutate(
                        {
                          id: selected.id,
                          enabled: false,
                          revision: activation.revision,
                          config: activation.config,
                        },
                        {
                          onSuccess: () => {
                            setSelected(null);
                            notify("Plugin disabled in this server");
                          },
                        },
                      );
                    }}
                  >
                    Disable for server
                  </Button>
                )}
                <Button
                  disabled={action.isPending}
                  onClick={() => {
                    try {
                      const config: unknown = JSON.parse(settings);
                      action.mutate(
                        {
                          id: selected.id,
                          enabled: true,
                          config,
                          revision:
                            query.data?.activations.find((a) => a.pluginId === selected.id)
                              ?.revision ?? 0,
                        },
                        {
                          onSuccess: () => {
                            setSelected(null);
                            notify("Plugin settings saved and activated");
                          },
                        },
                      );
                    } catch {
                      setError("Enter valid plugin settings JSON.");
                    }
                  }}
                >
                  <Check size={14} />
                  Save & enable
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!operator}
        onOpenChange={(v) => {
          if (!v) setOperator("");
        }}
      >
        <DialogContent>
          <DialogTitle>Trusted package operations</DialogTitle>
          <DialogDescription>
            Global installation changes executable bot code. This deployment keeps that power in the
            operator’s terminal, where packages are checked against the trusted catalog.
          </DialogDescription>
          <Notice tone="warning">
            {query.data?.operator
              ? "Your Discord account is listed as an operator. Use your authorized host terminal for package changes."
              : "Your account has guild administration access. A host operator must perform global package changes."}
          </Notice>
          <pre>
            {operator === "operator-guide"
              ? ".\\centerify-plugins.cmd marketplace\n.\\centerify-plugins.cmd installed"
              : `.\\centerify-plugins.cmd info ${operator}\n.\\centerify-plugins.cmd install ${operator}\n.\\centerify-plugins.cmd verify ${operator}\n.\\centerify-plugins.cmd update ${operator}\n.\\centerify-plugins.cmd enable ${operator}\n.\\centerify-plugins.cmd disable ${operator}\n.\\centerify-plugins.cmd uninstall ${operator} --confirm`}
          </pre>
          <Notice>
            Review requested capabilities and dependencies before installation. Restart the bot to
            apply code changes. Saved plugin data is retained on uninstall. For failures, verify
            package integrity, disable the package, then restart and inspect redacted bot logs.
          </Notice>
        </DialogContent>
      </Dialog>
    </>
  );
}
