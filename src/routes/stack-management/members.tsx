import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Search, ChevronDown, ChevronUp, Loader2, ShieldCheck, Eye } from "lucide-react";
import { logAction } from "@/lib/audit";

export const Route = createFileRoute("/stack-management/members")({
  component: Members,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type Assignment = {
  id: string;
  subscription_id: string;
  assigned_email: string;
  assigned_name: string | null;
  status: "active" | "revoked";
  assigned_at: string;
  revoked_at: string | null;
  subscriptions: { name: string; vendor: string | null; status: string; category: string | null } | null;
};

type SMUserRole = {
  user_id: string;
  role: "super_admin" | "viewer";
  granted_at: string;
  profiles: { email: string; full_name: string | null } | null;
};

type MemberGroup = {
  email: string;
  name: string | null;
  active: Assignment[];
  revoked: Assignment[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByEmail(assignments: Assignment[]): MemberGroup[] {
  const map = new Map<string, MemberGroup>();
  for (const a of assignments) {
    const key = a.assigned_email.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { email: a.assigned_email, name: a.assigned_name, active: [], revoked: [] });
    }
    const g = map.get(key)!;
    if (!g.name && a.assigned_name) g.name = a.assigned_name;
    if (a.status === "active") g.active.push(a);
    else g.revoked.push(a);
  }
  return [...map.values()].sort((a, b) =>
    (a.name ?? a.email).localeCompare(b.name ?? b.email),
  );
}

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-[color-mix(in_oklab,var(--sm-primary)_12%,transparent)] text-[var(--sm-primary)]",
  viewer:      "bg-muted text-muted-foreground",
};

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
          {group.name && (
            <div className="font-medium truncate">{group.name}</div>
          )}
          <div className="font-mono text-sm text-muted-foreground truncate">{group.email}</div>
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
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
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
                  <div className="text-sm font-medium truncate">{sub?.name ?? "Unknown subscription"}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {sub?.vendor ?? ""}
                    {sub?.category ? ` · ${sub.category}` : ""}
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

  useEffect(() => { load(); }, []);

  const revoke = async (a: Assignment) => {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("sm_license_assignments")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: user.id })
      .eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    await logAction({
      action: "subscription.license_revoked",
      entity_type: "subscription",
      entity_id: a.subscription_id,
      metadata: { assigned_email: a.assigned_email, from: "members_view" },
    });
    toast.success("License revoked");
    load();
  };

  const groups = groupByEmail(assignments);
  const filtered = search.trim()
    ? groups.filter((g) =>
        g.email.toLowerCase().includes(search.toLowerCase()) ||
        g.name?.toLowerCase().includes(search.toLowerCase()),
      )
    : groups;

  const totalActive = assignments.filter((a) => a.status === "active").length;

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Stack Management
        </div>
        <h1 className="font-display text-3xl tracking-tight">Members</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          License holders and their subscription access.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">SM users</div>
          <div className="mt-1 font-display text-2xl">{smUsers.length}</div>
          <div className="mt-1 flex gap-2">
            {smUsers.filter((u) => u.role === "super_admin").length > 0 && (
              <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${ROLE_COLORS.super_admin}`}>
                {smUsers.filter((u) => u.role === "super_admin").length} super admin
              </span>
            )}
            {smUsers.filter((u) => u.role === "viewer").length > 0 && (
              <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${ROLE_COLORS.viewer}`}>
                {smUsers.filter((u) => u.role === "viewer").length} viewer
              </span>
            )}
          </div>
        </Card>
        <Card className="p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">License holders</div>
          <div className="mt-1 font-display text-2xl">{groups.length}</div>
        </Card>
        <Card className="p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Active assignments</div>
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
                    <div className="font-mono text-xs text-muted-foreground truncate">{u.profiles.email}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${ROLE_COLORS[u.role]}`}>
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
        <div className="border-b border-border px-5 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            License holders ({filtered.length})
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
              {search ? "No members match your search." : "No license assignments yet."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((group) => (
              <MemberCard
                key={group.email}
                group={group}
                smRole={smRole}
                onRevoke={revoke}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
