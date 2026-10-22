"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Bell,
  Check,
  Command,
  FileJson,
  Heart,
  LogIn,
  LogOut,
  Save,
  Settings2,
  Shield,
  Sparkles,
  Ticket,
} from "lucide-react";
import { settingsPatchSchema } from "../../src/dashboard/contracts";
import { useAction, useResource } from "@/lib/client";
import type { Resources, Settings } from "@/lib/types";
import { useWorkspace } from "./shell";
import { Badge, Failure, Heading, Loading, Notice } from "./shared";
import { Button } from "./ui/button";
import { TicketDepartments } from "./ticket-tools";
import { Switch } from "./ui/switch";
type Patch = z.infer<typeof settingsPatchSchema>;
const sections = [
  { id: "welcome", label: "Welcome & goodbye", icon: Heart },
  { id: "roles", label: "Automatic roles", icon: Shield },
  { id: "logging", label: "Logging", icon: Bell },
  { id: "xp", label: "Experience & XP", icon: Sparkles },
  { id: "tickets", label: "Tickets", icon: Ticket },
  { id: "moderation", label: "Moderation & warnings", icon: Shield },
  { id: "commands", label: "Command access", icon: Command },
  { id: "advanced", label: "All persisted settings", icon: Settings2 },
  { id: "runtime", label: "Runtime configuration", icon: FileJson },
];
export function SettingsPage() {
  const { guild } = useWorkspace(),
    query = useResource<Settings>(guild.id, "settings"),
    resources = useResource<Resources>(guild.id, "resources");
  const [snapshot, setSnapshot] = useState<Settings | null>(null);
  useEffect(() => {
    if (query.data && !snapshot) setSnapshot(query.data);
  }, [query.data, snapshot]);
  if (query.isPending) return <Loading label="Opening your server settings" />;
  if (query.error) return <Failure error={query.error} retry={() => void query.refetch()} />;
  if (!snapshot) return <Loading label="Preparing your settings editor" />;
  const reload = async () => {
    const result = await query.refetch();
    if (result.data) setSnapshot(result.data);
  };
  return (
    <>
      {query.data.config.updatedAt !== snapshot.config.updatedAt && (
        <Notice tone="warning">
          Settings changed elsewhere. Your open form is preserved; saving will reject its stale
          revision. Reload to review the current values.
        </Notice>
      )}
      {
        <SettingsEditor
          key={snapshot.config.updatedAt}
          settings={snapshot}
          resources={resources.data}
          reload={() => void reload()}
        />
      }
    </>
  );
}
function SettingsEditor({
  settings,
  resources,
  reload,
}: {
  settings: Settings;
  resources?: Resources;
  reload: () => void;
}) {
  const { guild, me, notify } = useWorkspace(),
    [section, setSection] = useState("welcome"),
    [advanced, setAdvanced] = useState(""),
    [jsonError, setJsonError] = useState("");
  const fields = settingsPatchSchema.keyof().options;
  const defaults = Object.fromEntries(
    fields
      .filter((key) => settings.config[key] !== undefined)
      .map((key) => [key, settings.config[key]]),
  ) as Patch;
  defaults.warningRoleSettings = settings.warningRoleSettings;
  defaults.commandRoleAccess = settings.commandRoleAccess;
  const form = useForm<Patch>({
      resolver: zodResolver(settingsPatchSchema),
      defaultValues: defaults,
    }),
    action = useAction(guild.id, "settings"),
    dirty = form.formState.isDirty;
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  function save(values: Patch) {
    const patch = Object.fromEntries(
      Object.keys(form.formState.dirtyFields).map((key) => [key, values[key as keyof Patch]]),
    );
    if (!Object.keys(patch).length) {
      notify("Your settings are already up to date");
      return;
    }
    action.mutate(
      { expectedUpdatedAt: settings.config.updatedAt, patch },
      {
        onSuccess: () => {
          notify(
            me.user.demo
              ? "Demo settings saved for this browser session. No bot settings changed."
              : "Server settings saved. The bot uses these settings immediately.",
          );
          reload();
        },
      },
    );
  }
  const channelOptions = resources?.channels.filter((c) => c.type === 0 || c.type === 5) ?? [];
  const channel = (
    field: "welcomeChannelId" | "goodbyeChannelId" | "loggingChannelId",
    label: string,
  ) => (
    <label>
      {label}
      <select
        value={String(form.watch(field) ?? "")}
        onChange={(e) => form.setValue(field, e.target.value || null, { shouldDirty: true })}
      >
        <option value="">Choose a channel</option>
        {channelOptions.map((c) => (
          <option key={c.id} value={c.id}>
            #{c.name}
          </option>
        ))}
      </select>
      <small>Centerify needs View Channel and Send Messages here.</small>
    </label>
  );
  const toggle = (field: keyof Patch, label: string, description: string) => (
    <div className="toggle-row">
      <div>
        <label htmlFor={field}>{label}</label>
        <p>{description}</p>
      </div>
      <Switch
        id={field}
        checked={Boolean(form.watch(field))}
        onCheckedChange={(value) => form.setValue(field, value as never, { shouldDirty: true })}
      />
    </div>
  );
  function applyJson() {
    try {
      const parsed = settingsPatchSchema.parse(JSON.parse(advanced));
      for (const [key, value] of Object.entries(parsed))
        form.setValue(key as keyof Patch, value as never, { shouldDirty: true });
      setJsonError("");
      notify("Validated changes applied to the form. Save to persist them.");
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "Invalid settings JSON");
    }
  }
  return (
    <>
      <Heading
        eyebrow="THE LITTLE DETAILS THAT MAKE IT YOURS"
        title="A place that feels like your place."
        description="Thoughtful defaults. Clear controls. One shared source of server settings."
      >
        <div className="toolbar-group">
          {dirty && <Badge tone="warning">Unsaved changes</Badge>}
          <Button
            variant="secondary"
            disabled={action.isPending}
            onClick={() => {
              form.reset(defaults);
              reload();
            }}
          >
            Reload
          </Button>
          <Button
            disabled={action.isPending || !dirty || section === "runtime"}
            onClick={() => void form.handleSubmit(save)()}
          >
            <Save size={15} />
            Save changes
          </Button>
        </div>
      </Heading>
      {!guild.verified && (
        <Notice tone="warning">
          The server owner must run <code>/verify</code> before these settings can be changed.
        </Notice>
      )}
      {action.error && <Notice tone="error">{action.error.message}</Notice>}
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {sections.map((s) => (
            <button
              key={s.id}
              className={section === s.id ? "active" : ""}
              onClick={() => {
                setSection(s.id);
                if (s.id === "advanced") setAdvanced(JSON.stringify(form.getValues(), null, 2));
              }}
            >
              <s.icon size={15} />
              {s.label}
            </button>
          ))}
        </nav>
        <section className="panel">
          <div className="panel-body">
            <div className="settings-section-title">
              <h2>{sections.find((s) => s.id === section)?.label}</h2>
              <p>
                {section === "runtime"
                  ? "Global overrides are applied by an authorized operator and require a bot restart."
                  : "Changes are validated by the same backend used by Centerify. Save when you’re ready."}
              </p>
            </div>
            <form className="form-stack" onSubmit={form.handleSubmit(save)}>
              {section === "welcome" && (
                <>
                  <div className="settings-section-title">
                    <h3>
                      <LogIn size={14} style={{ display: "inline", marginRight: 7 }} />
                      The first hello
                    </h3>
                  </div>
                  {toggle(
                    "welcomeEnabled",
                    "Send a welcome message",
                    "Make new members feel at home.",
                  )}
                  {channel("welcomeChannelId", "Welcome channel")}
                  <label>
                    Welcome message
                    <textarea {...form.register("welcomeMessage")} />
                    <small>
                      Variables: <code>{"{user}"}</code> <code>{"{server}"}</code>{" "}
                      <code>{"{memberCount}"}</code>
                    </small>
                  </label>
                  <div className="settings-section-title section-spacer">
                    <h3>
                      <LogOut size={14} style={{ display: "inline", marginRight: 7 }} />A friendly
                      goodbye
                    </h3>
                  </div>
                  {toggle(
                    "goodbyeEnabled",
                    "Send a goodbye message",
                    "Acknowledge members when they leave.",
                  )}
                  {channel("goodbyeChannelId", "Goodbye channel")}
                  <label>
                    Goodbye message
                    <textarea {...form.register("goodbyeMessage")} />
                    <small>
                      Variables: <code>{"{displayName}"}</code> <code>{"{server}"}</code>{" "}
                      <code>{"{memberCount}"}</code>
                    </small>
                  </label>
                  <div className="discord-preview">
                    <span className="preview-avatar">
                      <Heart size={17} />
                    </span>
                    <div>
                      <strong>
                        Centerify<span className="bot-tag">APP</span>
                      </strong>
                      <small>Today at 12:00</small>
                      <p>
                        {String(form.watch("welcomeMessage") ?? "")
                          .replaceAll("{user}", "@new-member")
                          .replaceAll("{server}", guild.name)
                          .replaceAll("{memberCount}", String(guild.memberCount))}
                      </p>
                    </div>
                  </div>
                </>
              )}
              {section === "roles" && (
                <>
                  {toggle(
                    "autoRoleEnabled",
                    "Assign an automatic role",
                    "Give new members a safe, dedicated role when they join.",
                  )}
                  <label>
                    Automatic role
                    <select
                      value={String(form.watch("autoRoleId") ?? "")}
                      onChange={(e) =>
                        form.setValue("autoRoleId", e.target.value || null, { shouldDirty: true })
                      }
                    >
                      <option value="">Choose a role</option>
                      {resources?.roles
                        .filter((r) => !r.managed)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                    </select>
                    <small>
                      The role must be safe and below both your role and Centerify’s highest role.
                    </small>
                  </label>
                </>
              )}
              {section === "logging" && (
                <>
                  {toggle(
                    "loggingEnabled",
                    "Keep a server log",
                    "Use the bot’s existing logging destinations and behavior.",
                  )}
                  {channel("loggingChannelId", "Logging channel")}
                  <Notice>
                    Dashboard audit records are always stored separately for accountability. This
                    setting controls the bot’s existing Discord logging destination.
                  </Notice>
                </>
              )}
              {section === "xp" && (
                <>
                  {toggle(
                    "xpEnabled",
                    "Enable community XP",
                    "Recognize the little ways members take part.",
                  )}
                  <label>
                    Earning methods
                    <select {...form.register("xpMethods")}>
                      {[
                        ["messages", "Messages"],
                        ["reactions", "Reactions"],
                        ["daily", "Daily claim"],
                        ["messages,reactions", "Messages + reactions"],
                        ["messages,daily", "Messages + daily"],
                        ["reactions,daily", "Reactions + daily"],
                        ["messages,reactions,daily", "All methods"],
                      ].map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="form-grid">
                    {[
                      ["xpMessageAmount", "XP per message"],
                      ["xpReactionAmount", "XP per reaction"],
                      ["xpDailyAmount", "Daily claim XP"],
                      ["xpCooldownSeconds", "Cooldown (seconds)"],
                    ].map(([name, label]) => (
                      <label key={name}>
                        {label}
                        <input
                          type="number"
                          min={name === "xpCooldownSeconds" ? 10 : 1}
                          max={name === "xpCooldownSeconds" ? 86400 : 10000}
                          {...form.register(name as keyof Patch, { valueAsNumber: true })}
                        />
                      </label>
                    ))}
                  </div>
                  <label>
                    XP sharing
                    <select {...form.register("xpSharing")}>
                      <option value="server">This server only</option>
                      <option value="global">Mutual global sharing</option>
                      <option value="selected">Selected peer servers</option>
                    </select>
                    <small>
                      Peers must opt into the same sharing policy. This does not change other
                      servers’ settings.
                    </small>
                  </label>
                  <label>
                    Peer guild IDs
                    <input
                      {...form.register("xpSharedGuildIds")}
                      placeholder="Comma-separated server IDs"
                    />
                  </label>
                </>
              )}
              {section === "tickets" && (
                <>
                  <Notice>
                    Configure the built-in ticket panel here. Publish a panel with{" "}
                    <code>/ticket panel</code> in Discord. Better Ticket departments are managed
                    through <code>/bticket</code>.
                  </Notice>
                  <label>
                    Ticket settings
                    <textarea
                      className="code-editor"
                      style={{ minHeight: 180 }}
                      defaultValue={JSON.stringify(
                        form.getValues("ticketSettings") ?? {
                          enabled: false,
                          categoryId: "",
                          supportRoleId: "",
                        },
                        null,
                        2,
                      )}
                      onChange={(e) => {
                        try {
                          form.setValue("ticketSettings", JSON.parse(e.target.value), {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          setJsonError("");
                        } catch {
                          setJsonError("Ticket settings must be valid JSON");
                        }
                      }}
                    />
                    <small>
                      Use a category ID and a dedicated support role below your role and the bot’s
                      role.
                    </small>
                  </label>
                </>
              )}
              {section === "tickets" && <TicketDepartments />}
              {section === "moderation" && (
                <>
                  {toggle(
                    "globalBanEnabled",
                    "Opt into global bans",
                    "Cross-server moderation still requires authorization in each target guild.",
                  )}
                  {toggle(
                    "globalWarnEnabled",
                    "Opt into global warnings",
                    "Only explicitly authorized global moderators can act across servers.",
                  )}
                  {toggle(
                    "globalNoteEnabled",
                    "Opt into global notes",
                    "Permit the existing global note behavior.",
                  )}
                  <label>
                    Warning role policy
                    <textarea
                      className="code-editor"
                      defaultValue={JSON.stringify(settings.warningRoleSettings, null, 2)}
                      onChange={(e) => {
                        try {
                          form.setValue("warningRoleSettings", JSON.parse(e.target.value), {
                            shouldDirty: true,
                          });
                          setJsonError("");
                        } catch {
                          setJsonError("Warning settings must be valid JSON");
                        }
                      }}
                    />
                    <small>
                      Validated by the bot’s authoritative warning role policy. Modes: numbered,
                      single, none.
                    </small>
                  </label>
                </>
              )}
              {section === "commands" && (
                <>
                  <label>
                    Per-command role rules
                    <textarea
                      className="code-editor"
                      defaultValue={JSON.stringify(settings.commandRoleAccess, null, 2)}
                      onChange={(e) => {
                        try {
                          form.setValue("commandRoleAccess", JSON.parse(e.target.value), {
                            shouldDirty: true,
                          });
                          setJsonError("");
                        } catch {
                          setJsonError("Command access must be valid JSON");
                        }
                      }}
                    />
                    <small>
                      Example:{" "}
                      <code>{'{"ban":{"allowedRoleIds":["ROLE_ID"],"deniedRoleIds":[]}}'}</code>
                    </small>
                  </label>
                  <Notice>
                    These restrictions are additional to Discord permissions. Settings, setup,
                    verify and unverify keep their built-in access rules.
                  </Notice>
                </>
              )}
              {section === "advanced" && (
                <>
                  <label>
                    Persisted settings patch
                    <textarea
                      className="code-editor"
                      value={advanced}
                      onChange={(e) => setAdvanced(e.target.value)}
                      spellCheck={false}
                    />
                    <small>Only changed fields are saved. Unknown keys are rejected.</small>
                  </label>
                  <Button type="button" variant="secondary" onClick={applyJson}>
                    <Check size={14} />
                    Validate and apply to form
                  </Button>
                </>
              )}
              {section === "runtime" && (
                <>
                  <Notice>
                    Keep <code>centerify.config.json</code> sparse. Shell environment variables
                    retain precedence over selected dotenv files and JSON configuration. Use{" "}
                    <code>--config</code> and <code>--env-file</code> with the bot executable.
                  </Notice>
                  <pre>{JSON.stringify(settings.restartSettings, null, 2)}</pre>
                  <p className="inline-note">
                    Module availability, bot identity, prefixes and built-in command aliases are
                    operator settings. Changes require configuration validation and a bot restart.
                  </p>
                </>
              )}
              {jsonError && <Notice tone="error">{jsonError}</Notice>}
              {Object.entries(form.formState.errors).map(([key, error]) => (
                <p className="field-error" key={key}>
                  {key}: {error.message ?? "Check this field’s values"}
                </p>
              ))}
              {section !== "runtime" && (
                <div className="form-actions">
                  <span className="inline-note">
                    {dirty ? "You have unsaved changes." : "Everything is up to date."}
                  </span>
                  <Button type="submit" disabled={!dirty || action.isPending || !!jsonError}>
                    <Save size={14} />
                    Save changes
                  </Button>
                </div>
              )}
            </form>
          </div>
        </section>
      </div>
    </>
  );
}
