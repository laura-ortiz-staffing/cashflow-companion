import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import {
  buildCostModel,
  fmtNative,
  fmtUSD,
  loadCostData,
  projectTrend,
  toUSD,
  unitMonthly,
  type CostModel,
} from "@/lib/sm-costs";
import { KindBadge, StatusBadge } from "@/components/ProjectBadges";
import { ProjectDialog } from "@/components/ProjectDialog";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Loader2, Mail, Pencil, Plus, Trash2, Users, X } from "lucide-react";

export const Route = createFileRoute("/stack-management/projects/$id")({
  component: ProjectDetail,
});

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-display text-2xl tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
    </Card>
  );
}

function ProjectDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { smRole, user } = useAuth();
  const isSuperAdmin = smRole === "super_admin";

  const [model, setModel] = useState<CostModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const load = useCallback(async () => {
    try {
      setModel(buildCostModel(await loadCostData()));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load project");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const project = model?.data.projects.find((p) => p.id === id);
  const cost = model?.byProject.get(id);
  const trend = useMemo(() => (model ? projectTrend(model, id) : []), [model, id]);

  const subsById = useMemo(() => new Map((model?.data.subs ?? []).map((s) => [s.id, s])), [model]);
  const myAllocations = (model?.data.allocations ?? []).filter((a) => a.project_id === id);
  const myLicenses = (model?.data.licenses ?? []).filter((l) => l.project_id === id);
  const notCounting = myAllocations.filter(
    (a) => subsById.get(a.subscription_id)?.status !== "active",
  );

  const unlink = async (allocationId: string, subscriptionId: string) => {
    const { error: err } = await db
      .from("sm_project_subscriptions")
      .delete()
      .eq("id", allocationId);
    if (err) {
      toast.error(err.message);
      return;
    }
    await logAction({
      action: "subscription.project_unlinked",
      entity_type: "subscription",
      entity_id: subscriptionId,
      new_state: { project_id: id },
    });
    load();
  };

  const remove = async () => {
    setBusy(true);
    const { error: err } = await db.from("sm_projects").delete().eq("id", id);
    setBusy(false);
    if (err) {
      toast.error(err.message);
      return;
    }
    await logAction({ action: "sm_project.deleted", entity_type: "sm_project", entity_id: id });
    toast.success("Project deleted");
    navigate({ to: "/stack-management/projects" });
  };

  if (error) {
    return <Card className="p-6 text-sm text-destructive">Could not load project: {error}</Card>;
  }
  if (!model) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!project || !cost) {
    return (
      <div className="space-y-4">
        <Link
          to="/stack-management/projects"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Projects
        </Link>
        <Card className="p-6 text-sm text-muted-foreground">This project does not exist.</Card>
      </div>
    );
  }

  const share = model.assignedUsd > 0 ? Math.round((cost.usd / model.assignedUsd) * 100) : 0;
  const maxTrend = Math.max(...trend.map((t) => t.usd), 0);

  return (
    <div className="space-y-6">
      <Link
        to="/stack-management/projects"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Projects
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl tracking-tight">{project.name}</h1>
            <KindBadge kind={project.kind} />
            <StatusBadge status={project.status} />
          </div>
          {project.description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{project.description}</p>
          )}
        </div>
        {isSuperAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" className="gap-1.5" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button
              variant="outline"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        )}
      </div>

      {model.missingRate && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          Some costs are in COP and no exchange rate is set, so they are not included. Set it on the
          Projects page.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Monthly cost" value={fmtUSD(cost.usd)} hint="In USD, per month" />
        <Kpi label="Tools" value={String(cost.lines.length)} hint="Active subscriptions it uses" />
        <Kpi
          label="Licenses"
          value={String(myLicenses.length)}
          hint="Assigned straight to this project"
        />
        <Kpi label="Share of total" value={`${share}%`} hint="Of what is assigned to projects" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-display text-lg">Trend</h3>
              <span className="text-xs text-muted-foreground">Last 6 months</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              What was actually paid each month for this project's tools, in USD. Annual and
              quarterly plans show up in the month they were paid.
            </p>
            {maxTrend === 0 ? (
              <p className="mt-6 text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <div className="mt-4 h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tickFormatter={(v: number) => `$${v}`}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      tickLine={false}
                      axisLine={false}
                      width={52}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                      formatter={(v: number) => [fmtUSD(v), "Paid"]}
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="usd" fill="var(--sm-primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
              <div>
                <h3 className="font-display text-lg">Tools</h3>
                <p className="text-xs text-muted-foreground">
                  What each subscription costs this project per month.
                </p>
              </div>
              {isSuperAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setLinkOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" /> Link subscription
                </Button>
              )}
            </div>

            {cost.lines.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No tools linked yet. Link a subscription to start counting its cost here.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {cost.lines.map((l) => {
                  const alloc = myAllocations.find((a) => a.subscription_id === l.subscriptionId);
                  return (
                    <div key={l.subscriptionId} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          to="/stack-management/subscriptions/$id"
                          params={{ id: l.subscriptionId }}
                          className="truncate text-sm font-medium hover:underline"
                        >
                          {l.name}
                        </Link>
                        <div className="truncate text-xs text-muted-foreground">
                          {l.vendor ? `${l.vendor} · ` : ""}
                          {[
                            l.allocationPct !== null ? `${l.allocationPct}% of the cost` : null,
                            l.licenses > 0
                              ? `${l.licenses} license${l.licenses === 1 ? "" : "s"} assigned`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" + ")}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-display tabular-nums">
                          {l.usd === null ? "—" : fmtUSD(l.usd)}
                        </div>
                        {l.currency !== "USD" && (
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {fmtNative(l.native, l.currency)}
                          </div>
                        )}
                      </div>
                      {isSuperAdmin && alloc && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => unlink(alloc.id, l.subscriptionId)}
                          aria-label="Unlink"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {notCounting.length > 0 && (
              <div className="border-t border-border bg-muted/30 px-5 py-3 text-xs text-muted-foreground">
                Linked but not counting (not active):{" "}
                {notCounting
                  .map((a) => {
                    const s = subsById.get(a.subscription_id);
                    return s ? `${s.name} (${s.status})` : "unknown";
                  })
                  .join(", ")}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="font-display text-lg">
              {project.kind === "client" ? "Client" : "Internal initiative"}
            </h3>
            {project.kind === "client" ? (
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Company
                  </dt>
                  <dd>{project.client_company ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Contact
                  </dt>
                  <dd>{project.client_contact_name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Email
                  </dt>
                  <dd>
                    {project.client_contact_email ? (
                      <a
                        href={`mailto:${project.client_contact_email}`}
                        className="inline-flex items-center gap-1.5 hover:underline"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        {project.client_contact_email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Not tied to an outside client.</p>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-display text-lg">Licenses</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Seats given to a person for this project. Each one counts its own seat price.
            </p>
            {myLicenses.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">None yet.</p>
            ) : (
              <div className="mt-3 divide-y divide-border">
                {myLicenses.map((l) => {
                  const s = subsById.get(l.subscription_id);
                  const seat = s ? toUSD(unitMonthly(s), s.currency, model.rate) : null;
                  return (
                    <div key={l.id} className="flex items-center justify-between gap-2 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {l.assigned_name ?? l.assigned_email ?? "Unnamed"}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {s?.name ?? "Subscription"}
                        </div>
                      </div>
                      <div className="shrink-0 font-display text-sm tabular-nums">
                        {seat === null ? "—" : fmtUSD(seat)}
                        <span className="font-mono text-[10px] text-muted-foreground"> /mo</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      <ProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={project}
        onSaved={() => {
          setEditOpen(false);
          load();
        }}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            “{project.name}” will be removed. Its subscription links are deleted and its licenses
            become unassigned. The subscriptions and payments themselves are not touched.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={busy}>
              {busy ? "Deleting…" : "Delete project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LinkSubscriptionDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        projectId={id}
        model={model}
        userId={user?.id ?? null}
        onLinked={() => {
          setLinkOpen(false);
          load();
        }}
      />
    </div>
  );
}

function LinkSubscriptionDialog({
  open,
  onOpenChange,
  projectId,
  model,
  userId,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  model: CostModel;
  userId: string | null;
  onLinked: () => void;
}) {
  const [subId, setSubId] = useState("");
  const [pct, setPct] = useState("");
  const [busy, setBusy] = useState(false);

  const linkedIds = new Set(
    model.data.allocations.filter((a) => a.project_id === projectId).map((a) => a.subscription_id),
  );
  const options = model.data.subs
    .filter((s) => ["active", "paused"].includes(s.status) && !linkedIds.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const remainingFor = (sid: string) =>
    Math.max(
      0,
      100 -
        model.data.allocations
          .filter((a) => a.subscription_id === sid)
          .reduce((s, a) => s + Number(a.allocation_pct), 0),
    );

  useEffect(() => {
    if (open) {
      setSubId("");
      setPct("");
    }
  }, [open]);

  const pick = (sid: string) => {
    setSubId(sid);
    setPct(String(remainingFor(sid)));
  };

  const submit = async () => {
    const n = Number(pct);
    if (!userId || !subId || !(n > 0 && n <= 100)) {
      toast.error("Choose a subscription and a percentage between 1 and 100.");
      return;
    }
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("sm_project_subscriptions").insert({
      project_id: projectId,
      subscription_id: subId,
      allocation_pct: n,
      created_by: userId,
    });
    setBusy(false);
    if (error) {
      toast.error(
        error.code === "23514"
          ? "That subscription is already allocated more than 100% across projects."
          : error.message,
      );
      return;
    }
    await logAction({
      action: "subscription.project_linked",
      entity_type: "subscription",
      entity_id: subId,
      new_state: { project_id: projectId, allocation_pct: n },
    });
    toast.success("Subscription linked");
    onLinked();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link a subscription</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <Select value={subId} onValueChange={pick}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a subscription…" />
            </SelectTrigger>
            <SelectContent>
              {options.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.vendor ? ` · ${s.vendor}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {subId && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Input
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                  inputMode="decimal"
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">
                  % of its cost (up to {remainingFor(subId)}% is free)
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Example: a tool shared by three projects could be 50%, 30% and 20%.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy || !subId}
            style={{ background: "var(--sm-primary)", color: "var(--sm-primary-fg)" }}
          >
            {busy ? "Linking…" : "Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
