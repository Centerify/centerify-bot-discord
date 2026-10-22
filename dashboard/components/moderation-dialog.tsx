"use client";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { LoaderCircle, Shield } from "lucide-react";
import { moderationSchema } from "../../src/dashboard/contracts";
import { request, useResource } from "@/lib/client";
import type { Resources } from "@/lib/types";
import { useWorkspace } from "./shell";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge, Notice } from "./shared";
type Form = z.infer<typeof moderationSchema>;
export function ModerationDialog({
  open,
  onOpenChange,
  userIds = [],
  initialAction = "warn",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userIds?: string[];
  initialAction?: Form["action"];
}) {
  const { guild, me, notify } = useWorkspace(),
    client = useQueryClient(),
    resources = useResource<Resources>(guild.id, "resources", open),
    [confirm, setConfirm] = useState<Form | null>(null),
    key = useRef(crypto.randomUUID());
  const form = useForm<Form>({
    resolver: zodResolver(moderationSchema),
    defaultValues: { action: initialAction, userIds, reason: "", channelId: "" },
  });
  const action = form.watch("action"),
    idsKey = userIds.join(",");
  useEffect(() => {
    if (open) {
      form.reset({
        action: initialAction,
        userIds: idsKey ? idsKey.split(",") : [],
        reason: "",
        channelId: "",
      });
      setConfirm(null);
      key.current = crypto.randomUUID();
    }
  }, [open, initialAction, idsKey, form]);
  const mutation = useMutation({
    mutationFn: (body: Form) =>
      request<{ results: { userId: string; status: string; message: string }[] }>(
        `guilds/${guild.id}/moderation`,
        body,
        key.current,
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["guild", guild.id] });
      notify(
        me.user.demo
          ? "Simulation recorded. No Discord action occurred."
          : "Moderation operation finished. Review the per-member results.",
      );
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!mutation.isPending) {
          onOpenChange(v);
          if (!v) mutation.reset();
        }
      }}
    >
      <DialogContent>
        <DialogTitle>
          {confirm ? "Review this moderation action" : "A thoughtful next step"}
        </DialogTitle>
        <DialogDescription>
          {confirm
            ? "Check the targets and reason before confirming. Discord permissions and role hierarchy are checked again on the server."
            : "Every action is checked against Discord permissions, server rules, and role hierarchy. A reason is required."}
        </DialogDescription>
        {mutation.data ? (
          <>
            <Notice
              tone={
                mutation.data.results.some((r) => r.status === "failed") ? "warning" : "success"
              }
            >
              {me.user.demo
                ? "Simulation complete. No live action was performed."
                : "Operation completed with the results below."}
            </Notice>
            <div className="form-stack">
              {mutation.data.results.map((r) => (
                <div key={r.userId}>
                  <Badge tone={r.status === "failed" ? "error" : "success"}>{r.status}</Badge>{" "}
                  <code>{r.userId}</code>
                  <p className="inline-note">{r.message}</p>
                </div>
              ))}
            </div>
            <div className="form-actions">
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </>
        ) : confirm ? (
          <>
            <dl className="detail-list">
              <div>
                <dt>Action</dt>
                <dd>{confirm.action}</dd>
              </div>
              <div>
                <dt>Members</dt>
                <dd>{confirm.userIds.length} selected</dd>
              </div>
              <div>
                <dt>Reason</dt>
                <dd>{confirm.reason}</dd>
              </div>
              {confirm.durationMs && (
                <div>
                  <dt>Duration</dt>
                  <dd>{confirm.durationMs / 60000} minutes</dd>
                </div>
              )}
            </dl>
            <Notice tone="warning">
              {me.user.demo
                ? "This is a demo. Changes only affect this browser session."
                : "This action changes the Discord server and will be audited. Some actions cannot be reversed automatically."}
            </Notice>
            {mutation.error && (
              <Notice tone="error">
                {mutation.error.message}{" "}
                <a href="/audit" className="text-link">
                  Review audit log
                </a>
              </Notice>
            )}
            <div className="form-actions">
              <Button
                variant="secondary"
                disabled={mutation.isPending}
                onClick={() => setConfirm(null)}
              >
                Back
              </Button>
              <Button
                variant="destructive"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(confirm)}
              >
                {mutation.isPending ? <LoaderCircle className="spin" /> : <Shield size={15} />}{" "}
                {me.user.demo ? "Confirm simulation" : "Confirm action"}
              </Button>
            </div>
          </>
        ) : (
          <form onSubmit={form.handleSubmit(setConfirm)} className="form-stack">
            <div className="form-grid">
              <label>
                Action
                <select {...form.register("action")}>
                  <option value="warn">Issue warning</option>
                  <option value="unwarn">Revoke latest warning</option>
                  <option value="timeout">Apply timeout</option>
                  <option value="removetimeout">Remove timeout</option>
                  <option value="kick">Kick member</option>
                  <option value="ban">Ban member</option>
                  <option value="unban">Remove ban</option>
                  <option value="note">Add private moderator note</option>
                  <option value="addrole">Add role</option>
                  <option value="removerole">Remove role</option>
                </select>
              </label>
              <label>
                Action context channel
                <select {...form.register("channelId")}>
                  <option value="">Choose a text channel</option>
                  {resources.data?.channels
                    .filter((c) => c.type === 0 || c.type === 5)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.name}
                      </option>
                    ))}
                </select>
                <small>Choose a channel you can view and send messages in.</small>
              </label>
              <label className="field-full">
                Discord member IDs
                <textarea
                  rows={2}
                  style={{ minHeight: 65 }}
                  value={form.watch("userIds").join(", ")}
                  onChange={(e) =>
                    form.setValue("userIds", e.target.value.split(/[\s,]+/).filter(Boolean), {
                      shouldValidate: true,
                    })
                  }
                  placeholder="One or more Discord IDs, separated by commas"
                />
                <small>Up to 20 members. Each result is reported separately.</small>
              </label>
              {(action === "timeout" || action === "warn") && (
                <label>
                  Duration (minutes)
                  {action === "warn" && <small>Leave blank for a permanent warning.</small>}
                  <input
                    type="number"
                    min={1}
                    max={40320}
                    onChange={(e) =>
                      form.setValue(
                        "durationMs",
                        e.target.value ? Number(e.target.value) * 60000 : undefined,
                      )
                    }
                  />
                </label>
              )}
              {["addrole", "removerole"].includes(action) && (
                <label>
                  Role
                  <select {...form.register("roleId")}>
                    <option value="">Choose a role</option>
                    {resources.data?.roles
                      .filter((r) => !r.managed)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label className="field-full">
                Reason
                <textarea
                  {...form.register("reason")}
                  placeholder="Describe what happened and why this action is appropriate…"
                  maxLength={1000}
                />
              </label>
              <label className="field-full">
                Evidence reference (optional)
                <input
                  type="url"
                  placeholder="https://discord.com/channels/…"
                  onChange={(e) => form.setValue("evidence", e.target.value || undefined)}
                />
              </label>
            </div>
            {Object.entries(form.formState.errors).map(([key, error]) => (
              <p className="field-error" key={key}>
                {key}: {error.message ?? "Check this field"}
              </p>
            ))}
            <div className="form-actions">
              <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">Review action</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
