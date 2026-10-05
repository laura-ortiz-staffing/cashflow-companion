import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderKanban, Plus, X } from "lucide-react";

type ProjectOpt = { id: string; name: string; status: string };
type ProjectLink = { id: string; project_id: string; allocation_pct: number };

export function SubscriptionProjectsPanel({
  subscriptionId,
  isSuperAdmin,
}: {
  subscriptionId: string;
  isSuperAdmin: boolean;
}) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [links, setLinks] = useState<ProjectLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [pct, setPct] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const load = useCallback(async () => {
    const [p, l] = await Promise.all([
      db.from("sm_projects").select("id, name, status").order("name"),
      db
        .from("sm_project_subscriptions")
        .select("id, project_id, allocation_pct")
        .eq("subscription_id", subscriptionId),
    ]);
    setProjects(p.data ?? []);
    setLinks(l.data ?? []);
    setLoading(false);
  }, [db, subscriptionId]);

  useEffect(() => {
    load();
  }, [load]);

  const allocated = links.reduce((s, l) => s + Number(l.allocation_pct), 0);
  const remaining = Math.max(0, 100 - allocated);
  const nameOf = (id: string) => projects.find((p) => p.id === id)?.name ?? "Unknown project";
  const available = projects.filter(
    (p) => p.status !== "finished" && !links.some((l) => l.project_id === p.id),
  );

  const fail = (err: { code?: string; message?: string }) =>
    toast.error(
      err.code === "23514"
        ? "Allocations for this subscription cannot add up to more than 100%."
        : (err.message ?? "Something went wrong"),
    );

  const add = async () => {
    const n = Number(pct);
    if (!user || !projectId || !(n > 0 && n <= 100)) {
      toast.error("Choose a project and a percentage between 1 and 100.");
      return;
    }
    const { error } = await db.from("sm_project_subscriptions").insert({
      project_id: projectId,
      subscription_id: subscriptionId,
      allocation_pct: n,
      created_by: user.id,
    });
    if (error) return fail(error);
    await logAction({
      action: "subscription.project_linked",
      entity_type: "subscription",
      entity_id: subscriptionId,
      new_state: { project_id: projectId, allocation_pct: n },
    });
    toast.success("Project linked");
    setAdding(false);
    setProjectId("");
    setPct("");
    load();
  };

  const updatePct = async (l: ProjectLink, value: string) => {
    const n = Number(value);
    if (!(n > 0 && n <= 100) || n === Number(l.allocation_pct)) {
      load();
      return;
    }
    const { error } = await db
      .from("sm_project_subscriptions")
      .update({ allocation_pct: n })
      .eq("id", l.id);
    if (error) fail(error);
    load();
  };

  const remove = async (l: ProjectLink) => {
    const { error } = await db.from("sm_project_subscriptions").delete().eq("id", l.id);
    if (error) return fail(error);
    await logAction({
      action: "subscription.project_unlinked",
      entity_type: "subscription",
      entity_id: subscriptionId,
      new_state: { project_id: l.project_id },
    });
    load();
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-display text-lg">Projects</h3>
        </div>
        {isSuperAdmin && !adding && available.length > 0 && remaining > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              setAdding(true);
              setPct(String(remaining));
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Link
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Split this tool's cost between the projects that use it.
      </p>

      {loading ? null : links.length === 0 && !adding ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Not linked to any project yet. Its whole cost shows as unassigned.
        </p>
      ) : (
        <div className="mt-4 divide-y divide-border">
          {links.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2 py-2.5">
              <Link
                to="/stack-management/projects/$id"
                params={{ id: l.project_id }}
                className="truncate text-sm font-medium hover:underline"
              >
                {nameOf(l.project_id)}
              </Link>
              <div className="flex shrink-0 items-center gap-1.5">
                {isSuperAdmin ? (
                  <Input
                    key={`${l.id}-${l.allocation_pct}`}
                    defaultValue={Number(l.allocation_pct)}
                    onBlur={(e) => updatePct(l, e.target.value)}
                    inputMode="decimal"
                    className="h-8 w-16 text-right"
                  />
                ) : (
                  <span className="text-sm tabular-nums">{Number(l.allocation_pct)}</span>
                )}
                <span className="text-sm text-muted-foreground">%</span>
                {isSuperAdmin && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => remove(l)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="mt-4 space-y-3 rounded-lg border border-border p-3">
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a project…" />
            </SelectTrigger>
            <SelectContent>
              {available.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Input
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              inputMode="decimal"
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">% of the cost (max {remaining}%)</span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={add}
              style={{ background: "var(--sm-primary)", color: "var(--sm-primary-fg)" }}
            >
              Link project
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!loading && links.length > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Not assigned to any project</span>
          <span
            className={
              remaining > 0 ? "font-medium text-amber-600 dark:text-amber-400" : "font-medium"
            }
          >
            {remaining}%
          </span>
        </div>
      )}
    </Card>
  );
}
