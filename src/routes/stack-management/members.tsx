import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Users,
  Search,
  ChevronDown,
  ChevronUp,
  Loader2,
  ShieldCheck,
  Eye,
  UserPlus,
} from "lucide-react";
import { logAction } from "@/lib/audit";
import { ProjectSelect } from "@/components/ProjectSelect";

export const Route = createFileRoute("/stack-management/members")({
  component: Members,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type Assignment = {
  id: string;
  subscription_id: string;
  assigned_email: string | null;
  assigned_name: string | null;
  assignee_type: string;
  assignee_ref: string | null;
  status: "active" | "revoked";
  assigned_at: string;
  revoked_at: string | null;
  subscriptions: {
    name: string;
    vendor: string | null;
    status: string;
    category: string | null;
  } | null;
};

type SMUserRole = {
  user_id: string;
  role: "super_admin" | "viewer";
  granted_at: string;
  profiles: { email: string; full_name: string | null } | null;
};

type MemberGroup = {
  key: string;
  email: string | null;
  name: string | null;
  type: string;
  active: Assignment[];
  revoked: Assignment[];
};

type SubOption = { id: string; name: string; vendor: string | null };

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByAssignee(assignments: Assignment[]): MemberGroup[] {
  const map = new Map<string, MemberGroup>();
  for (const a of assignments) {
    const key = a.assigned_email
      ? a.assigned_email.toLowerCase()
      : `${a.assignee_type ?? "employee"}:${(a.assigned_name ?? a.id).toLowerCase()}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        email: a.assigned_email,
        name: a.assigned_name,
        type: a.assignee_type ?? "employee",
        active: [],
        revoked: [],
      });
    }
    const g = map.get(key)!;
    if (!g.name && a.assigned_name) g.name = a.assigned_name;
    if (a.status === "active") g.active.push(a);
    else g.revoked.push(a);
  }
  return [...map.values()].sort((a, b) =>
    (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""),
  );
}

const ROLE_COLORS: Record<string, string> = {
  super_admin:
    "bg-[color-mix(in_oklab,var(--sm-primary)_12%,transparent)] text-[var(--sm-primary)]",
  viewer: "bg-muted text-muted-foreground",
};

const TYPE_PILL: Record<string, string> = {
  employee: "bg-muted text-muted-foreground",
  client: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  project: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
};

// ── Assign license dialog ─────────────────────────────────────────────────────

function AssignLicenseDialog({
  open,
  onOpenChange,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAssigned: () => void;
}) {
  const { user } = useAuth();
  const [subscriptions, setSubscriptions] = useState<SubOption[]>([]);
  const [subscriptionId, setSubscriptionId] = useState("");
  const [assigneeType, setAssigneeType] = useState<"employee" | "client" | "project">("employee");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubscriptionId("");
    setAssigneeType("employee");
    setName("");
    setEmail("");
    setRef("");
    setNotes("");
    setProjectId("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("subscriptions")
      .select("id, name, vendor")
      .in("status", ["active", "paused"])
      .order("name")
      .then(({ data }: { data: SubOption[] | null }) => setSubscriptions(data ?? []));
  }, [open]);

  const TYPE_LABELS: Record<string, { nameLbl: string; refLbl: string; placeholder: string }> = {
    employee: { nameLbl: "Employee name", refLbl: "Employee ID", placeholder: "Full name" },
    client: {
      nameLbl: "Client name *",
      refLbl: "Client code",
      placeholder: "Client or company name",
    },
    project: { nameLbl: "Project name *", refLbl: "Project code", placeholder: "Project name" },
  };
  const lbl = TYPE_LABELS[assigneeType];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!subscriptionId) {
      toast.error("Select a subscription first.");
      return;
    }
    if (assigneeType !== "employee" && !name.trim()) {
      toast.error("Name is required for client and project assignments.");
      return;
    }
    setBusy(true);
    try {
      const assignedEmail = email.trim().toLowerCase() || null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("sm_license_assignments").insert({
        subscription_id: subscriptionId,
        assigned_email: assignedEmail,
        assigned_name: name.trim() || null,
        assignee_type: assigneeType,
        assignee_ref: ref.trim() || null,
        notes: notes.trim() || null,
        ...(projectId ? { project_id: projectId } : {}),
        assigned_by: user.id,
      });
      if (error) {
        if (error.code === "23505")
          toast.error("This email already has an active license for this subscription.");
        else throw error;
        return;
      }
      await logAction({
        action: "subscription.license_assigned",
        entity_type: "subscription",
        entity_id: subscriptionId,
        new_state: {
          assignee_type: assigneeType,
          assigned_email: assignedEmail,
          assigned_name: name.trim() || null,
        },
      });
      toast.success("License assigned");
      onAssigned();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign license");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign license</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 py-1">
          {/* Subscription */}
          <div className="space-y-1.5">
            <Label>Subscription *</Label>
            <Select value={subscriptionId} onValueChange={setSubscriptionId}>
              <SelectTrigger>
                <SelectValue placeholder="Select subscription…" />
              </SelectTrigger>
              <SelectContent>
                {subscriptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {s.vendor ? ` · ${s.vendor}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Assignee type */}
          <div className="space-y-1.5">
            <Label>Assign to</Label>
            <div className="flex gap-2">
              {(["employee", "client", "project"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setAssigneeType(t)}
                  className={`flex-1 rounded-lg border px-3 py-2 font-mono text-xs font-semibold transition-colors capitalize ${
                    assigneeType === t
                      ? "border-[var(--sm-primary)] bg-[color-mix(in_oklab,var(--sm-primary)_10%,transparent)] text-[var(--sm-primary)]"
                      : "border-border text-muted-foreground hover:border-[var(--sm-primary)]/40"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="m-name">{lbl.nameLbl}</Label>
            <Input
              id="m-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={lbl.placeholder}
              maxLength={120}
              required={assigneeType !== "employee"}
            />
          </div>

          {/* Email — employees only */}
          {assigneeType === "employee" && (
            <div className="space-y-1.5">
              <Label htmlFor="m-email">Email address</Label>
              <Input
                id="m-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="person@company.com (optional)"
              />
            </div>
          )}

          {/* Reference */}
          <div className="space-y-1.5">
            <Label htmlFor="m-ref">{lbl.refLbl}</Label>
            <Input
              id="m-ref"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="Optional"
              maxLength={120}
            />
          </div>

          <ProjectSelect
            value={projectId}
            onChange={setProjectId}
            hint="This seat's price will count toward the project."
          />

          <div className="space-y-1.5">
            <Label htmlFor="m-notes">Notes</Label>
            <Textarea
              id="m-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={300}
              placeholder="Optional…"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy}
              style={{ background: "var(--sm-primary)", color: "var(--sm-primary-fg)" }}
            >
              {busy ? "Saving…" : "Assign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Member card ───────────────────────────────────────────────────────────────

function MemberCard({
  group,
  smRole,
  onRevoke,
}: {
  group: MemberGroup;
  smRole: string | null;
  onRevoke: (a: Assignment) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isSuperAdmin = smRole === "super_admin";

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {group.name && <div className="font-medium truncate">{group.name}</div>}
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[9px] font-semibold ${TYPE_PILL[group.type] ?? TYPE_PILL.employee}`}
            >
              {group.type}
            </span>
          </div>
          {group.email && (
            <div className="font-mono text-sm text-muted-foreground truncate">{group.email}</div>
          )}
          {!group.name && !group.email && (
            <div className="font-mono text-sm text-muted-foreground">—</div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] text-muted-foreground">
              {group.active.length} active license{group.active.length !== 1 ? "s" : ""}
            </span>
            {group.revoked.length > 0 && (
              <span className="font-mono text-[10px] text-muted-foreground/60">
                · {group.revoked.length} revoked
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="shrink-0 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          {expanded ? "Collapse" : "Details"}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {group.active.length === 0 && group.revoked.length === 0 && (
            <p className="text-xs text-muted-foreground">No license assignments.</p>
          )}
          {[...group.active, ...group.revoked].map((a) => {
            const sub = a.subscriptions;
            return (
              <div
                key={a.id}
                className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${
                  a.status === "active" ? "bg-muted/40" : "bg-muted/20 opacity-60"
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {sub?.name ?? "Unknown subscription"}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {sub?.vendor ?? ""}
                    {sub?.category ? ` · ${sub.category}` : ""}
                    {a.assignee_ref ? ` · ${a.assignee_ref}` : ""}
                    {a.status === "revoked" && a.revoked_at
                      ? ` · revoked ${format(new Date(a.revoked_at), "MMM d, yyyy")}`
                      : ` · since ${format(new Date(a.assigned_at), "MMM d, yyyy")}`}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                      a.status === "active"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {a.status}
                  </span>
                  {isSuperAdmin && a.status === "active" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onRevoke(a)}
                      className="text-xs text-muted-foreground hover:text-destructive h-6 px-2"
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

function Members() {
  const { smRole, user } = useAuth();
  const isSuperAdmin = smRole === "super_admin";

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [smUsers, setSmUsers] = useState<SMUserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | "employee" | "client" | "project">("all");

  const load = async () => {
    setLoading(true);
    const [{ data: licData }, { data: roleData }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("sm_license_assignments")
        .select("*, subscriptions(name, vendor, status, category)")
        .order("assigned_at", { ascending: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("sm_user_roles")
        .select("user_id, role, granted_at, profiles(email, full_name)")
        .order("granted_at", { ascending: true }),
    ]);
    setAssignments((licData as Assignment[]) ?? []);
    setSmUsers((roleData as SMUserRole[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const revoke = async (a: Assignment) => {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("sm_license_assignments")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: user.id })
      .eq("id", a.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logAction({
      action: "subscription.license_revoked",
      entity_type: "subscription",
      entity_id: a.subscription_id,
      metadata: { assigned_email: a.assigned_email, from: "members_view" },
    });
    toast.success("License revoked");
    load();
  };

  const allGroups = groupByAssignee(assignments);

  const filtered = allGroups.filter((g) => {
    const matchType = typeFilter === "all" || g.type === typeFilter;
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q || (g.email ?? "").toLowerCase().includes(q) || (g.name ?? "").toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  const totalActive = assignments.filter((a) => a.status === "active").length;

  const employees = allGroups.filter((g) => g.type === "employee").length;
  const clients = allGroups.filter((g) => g.type === "client").length;
  const projects = allGroups.filter((g) => g.type === "project").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Stack Management
          </div>
          <h1 className="font-display text-3xl tracking-tight">Members</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            License holders and their subscription access.
          </p>
        </div>
        {isSuperAdmin && (
          <Button
            onClick={() => setAssignOpen(true)}
            style={{ background: "var(--sm-primary)", color: "var(--sm-primary-fg)" }}
            className="gap-2"
          >
            <UserPlus className="h-4 w-4" /> Assign license
          </Button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            SM users
          </div>
          <div className="mt-1 font-display text-2xl">{smUsers.length}</div>
          <div className="mt-1 flex gap-2">
            {smUsers.filter((u) => u.role === "super_admin").length > 0 && (
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${ROLE_COLORS.super_admin}`}
              >
                {smUsers.filter((u) => u.role === "super_admin").length} super admin
              </span>
            )}
            {smUsers.filter((u) => u.role === "viewer").length > 0 && (
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${ROLE_COLORS.viewer}`}
              >
                {smUsers.filter((u) => u.role === "viewer").length} viewer
              </span>
            )}
          </div>
        </Card>
        <Card className="p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Employees
          </div>
          <div className="mt-1 font-display text-2xl">{employees}</div>
        </Card>
        <Card className="p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Clients / Projects
          </div>
          <div className="mt-1 font-display text-2xl">{clients + projects}</div>
          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            {clients > 0 && `${clients} client${clients !== 1 ? "s" : ""}`}
            {clients > 0 && projects > 0 && " · "}
            {projects > 0 && `${projects} project${projects !== 1 ? "s" : ""}`}
          </div>
        </Card>
        <Card className="p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Active assignments
          </div>
          <div className="mt-1 font-display text-2xl">{totalActive}</div>
        </Card>
      </div>

      {/* SM roles section */}
      {isSuperAdmin && smUsers.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-3 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            SM access ({smUsers.length})
          </div>
          <div className="divide-y divide-border">
            {smUsers.map((u) => (
              <div key={u.user_id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {u.profiles?.full_name ?? u.profiles?.email ?? u.user_id}
                  </div>
                  {u.profiles?.email && (
                    <div className="font-mono text-xs text-muted-foreground truncate">
                      {u.profiles.email}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${ROLE_COLORS[u.role]}`}
                  >
                    {u.role === "super_admin" ? "Super Admin" : "Viewer"}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground/60">
                    since {format(new Date(u.granted_at), "MMM d, yyyy")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* License holders */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              License holders ({filtered.length})
            </div>
            {/* Type filter pills */}
            <div className="flex gap-1">
              {(["all", "employee", "client", "project"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold transition-colors capitalize ${
                    typeFilter === t
                      ? "bg-[var(--sm-primary)] text-[var(--sm-primary-fg)]"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-8 pl-8 text-sm w-48"
            />
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Eye className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              {search || typeFilter !== "all"
                ? "No members match your filters."
                : "No license assignments yet."}
            </p>
            {isSuperAdmin && !search && typeFilter === "all" && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4 gap-1.5"
                onClick={() => setAssignOpen(true)}
              >
                <UserPlus className="h-3.5 w-3.5" /> Assign first license
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((group) => (
              <MemberCard key={group.key} group={group} smRole={smRole} onRevoke={revoke} />
            ))}
          </div>
        )}
      </Card>

      {isSuperAdmin && (
        <AssignLicenseDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          onAssigned={() => {
            setAssignOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}
