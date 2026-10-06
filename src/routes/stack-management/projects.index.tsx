import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  buildCostModel,
  fmtUSD,
  loadCostData,
  type CostModel,
  type ProjectStatus,
} from "@/lib/sm-costs";
import { ExchangeRateCard } from "@/components/ExchangeRateCard";
import { KindBadge, StatusBadge } from "@/components/ProjectBadges";
import { ProjectDialog } from "@/components/ProjectDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, FolderKanban, Loader2, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/stack-management/projects/")({
  component: ProjectsPage,
});

function Stat({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint: string;
  warn?: boolean;
}) {
  return (
    <Card className={cn("p-4", warn && "border-amber-500/50")}>
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-display text-2xl tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
    </Card>
  );
}

const FILTERS: { value: "all" | ProjectStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "finished", label: "Finished" },
];

function ProjectsPage() {
  const { smRole } = useAuth();
  const isSuperAdmin = smRole === "super_admin";
  const navigate = useNavigate();

  const [model, setModel] = useState<CostModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | ProjectStatus>("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      setModel(buildCostModel(await loadCostData()));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    if (!model) return [];
    const q = query.trim().toLowerCase();
    return model.data.projects
      .map((p) => ({ project: p, cost: model.byProject.get(p.id)! }))
      .filter(({ project }) => filter === "all" || project.status === filter)
      .filter(
        ({ project }) =>
          !q ||
          project.name.toLowerCase().includes(q) ||
          (project.client_company ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => b.cost.usd - a.cost.usd || a.project.name.localeCompare(b.project.name));
  }, [model, filter, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: model?.data.projects.length ?? 0 };
    for (const p of model?.data.projects ?? []) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [model]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Cost allocation
          </div>
          <h1 className="font-display text-3xl tracking-tight">Projects</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            What each client or internal initiative costs per month in software and licenses, all in
            USD.
          </p>
        </div>
        {isSuperAdmin && (
          <Button
            onClick={() => setCreateOpen(true)}
            className="gap-2"
            style={{ background: "var(--sm-primary)", color: "var(--sm-primary-fg)" }}
          >
            <Plus className="h-4 w-4" /> New project
          </Button>
        )}
      </div>

      {error ? (
        <Card className="p-6 text-sm text-destructive">
          Could not load projects: {error}. If this is the first time, make sure the projects
          migration has been applied in Supabase.
        </Card>
      ) : !model ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat
              label="Total monthly cost"
              value={fmtUSD(model.totalUsd)}
              hint="All active subscriptions"
            />
            <Stat
              label="Assigned to projects"
              value={fmtUSD(model.assignedUsd)}
              hint={
                model.totalUsd > 0
                  ? `${Math.round((model.assignedUsd / model.totalUsd) * 100)}% of the total`
                  : "Nothing to assign yet"
              }
            />
            <Stat
              label="Not assigned"
              value={fmtUSD(model.unassigned.usd)}
              hint={
                model.unassigned.usd > 0
                  ? `${model.unassigned.lines.length} tool${model.unassigned.lines.length === 1 ? "" : "s"} still need a project`
                  : "Everything is assigned"
              }
              warn={model.unassigned.usd > 0}
            />
          </div>

          {model.missingRate && (
            <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Some costs are in COP and the official TRM could not be fetched, so they are left out
              of these totals. Try again later or type a rate on the right.
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search projects or clients…"
                    className="pl-9"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {FILTERS.map((f) => {
                    const active = filter === f.value;
                    return (
                      <button
                        key={f.value}
                        onClick={() => setFilter(f.value)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                          !active && "text-muted-foreground hover:bg-muted",
                        )}
                        style={
                          active
                            ? {
                                background: "var(--sm-primary)",
                                color: "var(--sm-primary-fg)",
                                borderColor: "transparent",
                              }
                            : undefined
                        }
                      >
                        {f.label}
                        <span className="opacity-70">{counts[f.value] ?? 0}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Card className="overflow-hidden">
                {rows.length === 0 ? (
                  <div className="p-10 text-center">
                    <FolderKanban className="mx-auto h-8 w-8 text-muted-foreground/40" />
                    <p className="mt-3 text-sm text-muted-foreground">
                      {model.data.projects.length === 0
                        ? "No projects yet. Create one, then link subscriptions to it."
                        : "No projects match this filter."}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {rows.map(({ project, cost }) => {
                      const share =
                        model.assignedUsd > 0 ? (cost.usd / model.assignedUsd) * 100 : 0;
                      return (
                        <Link
                          key={project.id}
                          to="/stack-management/projects/$id"
                          params={{ id: project.id }}
                          className="sm-row flex items-center gap-4 px-5 py-4"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate font-medium">{project.name}</span>
                              <KindBadge kind={project.kind} />
                              <StatusBadge status={project.status} />
                            </div>
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">
                              {project.client_company ? `${project.client_company} · ` : ""}
                              {cost.lines.length} tool{cost.lines.length === 1 ? "" : "s"}
                            </div>
                            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-[var(--sm-primary)]"
                                style={{ width: `${share}%` }}
                              />
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="font-display text-lg tabular-nums">
                              {fmtUSD(cost.usd)}
                            </div>
                            <div className="font-mono text-[10px] text-muted-foreground">
                              / month
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>

            <ExchangeRateCard rates={model.data.rates} isSuperAdmin={isSuperAdmin} onSaved={load} />
          </div>
        </>
      )}

      <ProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(id) => {
          setCreateOpen(false);
          navigate({ to: "/stack-management/projects/$id", params: { id } });
        }}
      />
    </div>
  );
}
