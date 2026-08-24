import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { logAction } from "@/lib/audit";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UserPlus, UserMinus, ShieldCheck, Eye } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/stack-management/users")({
  component: SMUsers,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type Profile = { id: string; email: string; full_name: string | null };
type AccessRow = { user_id: string; granted_at: string };
type SMRoleRow = { user_id: string; role: "super_admin" | "viewer"; granted_at: string };

type SMUser = Profile & {
  granted_at: string;
  smRole: "super_admin" | "viewer";
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_ICONS = { super_admin: ShieldCheck, viewer: Eye } as const;

function RoleChip({ role }: { role: "super_admin" | "viewer" }) {
  const Icon = ROLE_ICONS[role];
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground">
      <Icon className="h-3 w-3" />
      {role === "super_admin" ? "Super Admin" : "Viewer"}
    </span>
  );
}

function Avatar({ user: u, muted = false }: { user: Profile; muted?: boolean }) {
  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-sm ${muted ? "bg-muted text-muted-foreground" : "text-white sm-avatar"}`}
    >
      {(u.full_name?.[0] ?? u.email[0]).toUpperCase()}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

function SMUsers() {
  const { smRole: mySmRole, user: me } = useAuth();
  const [tab, setTab] = useState<"users" | "grant">("users");
  const [smUsers, setSmUsers] = useState<SMUser[]>([]);
  const [eligible, setEligible] = useState<Profile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [grantRole, setGrantRole] = useState<"super_admin" | "viewer">("viewer");

  const load = async () => {
    const [{ data: profiles }, { data: access }, { data: smRoles }] = await Promise.all([
      supabase.from("profiles").select("id, email, full_name"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("app_access").select("user_id, granted_at").eq("app", "stack_management"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("sm_user_roles").select("user_id, role, granted_at"),
    ]);

    const ps = (profiles ?? []) as Profile[];
    const ac = (access ?? []) as AccessRow[];
    const sr = (smRoles ?? []) as SMRoleRow[];

    const smRolesMap: Record<string, "super_admin" | "viewer"> = {};
    sr.forEach((r) => { smRolesMap[r.user_id] = r.role; });

    const smIds = new Set(ac.map((a) => a.user_id));

    setSmUsers(
      ps
        .filter((p) => smIds.has(p.id))
        .map((p) => ({
          ...p,
          granted_at: ac.find((a) => a.user_id === p.id)?.granted_at ?? "",
          smRole: smRolesMap[p.id] ?? "viewer",
        })),
    );
    setEligible(ps.filter((p) => !smIds.has(p.id)));
  };

  useEffect(() => {
    if (mySmRole === "super_admin") load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mySmRole]);

  if (mySmRole !== "super_admin") {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        User management is restricted to Super Admin.
      </div>
    );
  }

  const grantAccess = async (userId: string) => {
    if (!me) return;
    setBusy(userId);
    try {
      // Grant app access
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: accessErr } = await (supabase as any).from("app_access").insert({
        user_id: userId,
        app: "stack_management",
        granted_by: me.id,
      });
      if (accessErr) throw accessErr;

      // Set SM role
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: roleErr } = await (supabase as any).from("sm_user_roles").upsert({
        user_id: userId,
        role: grantRole,
        granted_by: me.id,
        granted_at: new Date().toISOString(),
      });
      if (roleErr) throw roleErr;

      await logAction({
        action: "app_access.granted",
        entity_type: "user",
        entity_id: userId,
        new_state: { app: "stack_management", sm_role: grantRole },
      });
      toast.success("Access granted");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to grant access");
    } finally {
      setBusy(null);
    }
  };

  const revokeAccess = async (userId: string) => {
    if (userId === me?.id) {
      toast.error("You can't revoke your own access.");
      return;
    }
    setBusy(userId);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("app_access")
        .delete()
        .eq("user_id", userId)
        .eq("app", "stack_management");
      if (error) throw error;
      // sm_user_roles row will cascade-delete when app_access is removed (or we can leave it)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("sm_user_roles").delete().eq("user_id", userId);
      await logAction({
        action: "app_access.revoked",
        entity_type: "user",
        entity_id: userId,
        previous_state: { app: "stack_management" },
      });
      toast.success("Access revoked");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke access");
    } finally {
      setBusy(null);
    }
  };

  const changeSmRole = async (userId: string, newRole: "super_admin" | "viewer") => {
    if (userId === me?.id && newRole !== "super_admin") {
      toast.error("You can't downgrade your own role.");
      return;
    }
    setBusy(`role-${userId}`);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("sm_user_roles")
        .update({ role: newRole, granted_by: me?.id, granted_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (error) throw error;
      await logAction({
        action: "sm_role.changed",
        entity_type: "user",
        entity_id: userId,
        new_state: { sm_role: newRole },
      });
      toast.success(`Role changed to ${newRole === "super_admin" ? "Super Admin" : "Viewer"}`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change role");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Access control
        </div>
        <h1 className="font-display text-3xl tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage who can access Stack Management and their SM role.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(["users", "grant"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 font-mono text-xs uppercase tracking-wider transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-[var(--sm-primary)] text-[var(--sm-primary)]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "users"
              ? `Users with access (${smUsers.length})`
              : `Grant access (${eligible.length})`}
          </button>
        ))}
      </div>

      {tab === "users" && (
        <Card className="overflow-hidden">
          {smUsers.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No users have access yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {smUsers.map((u) => {
                const isSelf = u.id === me?.id;
                return (
                  <div
                    key={u.id}
                    className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar user={u} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{u.full_name ?? u.email}</span>
                          {isSelf && (
                            <span className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider sm-role-badge">
                              you
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">{u.email}</div>
                        {u.granted_at && (
                          <div className="font-mono text-[10px] text-muted-foreground/70">
                            granted {format(new Date(u.granted_at), "MMM d, yyyy")}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <RoleChip role={u.smRole} />
                      {!isSelf && (
                        <Select
                          value={u.smRole}
                          onValueChange={(v) => changeSmRole(u.id, v as "super_admin" | "viewer")}
                          disabled={busy === `role-${u.id}`}
                        >
                          <SelectTrigger className="h-8 w-[130px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">
                              <span className="flex items-center gap-1.5 text-xs">
                                <Eye className="h-3 w-3" /> Viewer
                              </span>
                            </SelectItem>
                            <SelectItem value="super_admin">
                              <span className="flex items-center gap-1.5 text-xs">
                                <ShieldCheck className="h-3 w-3" /> Super Admin
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      {!isSelf && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === u.id}
                          onClick={() => revokeAccess(u.id)}
                          className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                          Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {tab === "grant" && (
        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-3 flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              These users have a Cashflow Companion account but no Stack Management access yet.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Default role:</span>
              <Select value={grantRole} onValueChange={(v) => setGrantRole(v as "super_admin" | "viewer")}>
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">
                    <span className="flex items-center gap-1.5 text-xs"><Eye className="h-3 w-3" /> Viewer</span>
                  </SelectItem>
                  <SelectItem value="super_admin">
                    <span className="flex items-center gap-1.5 text-xs"><ShieldCheck className="h-3 w-3" /> Super Admin</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {eligible.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              All registered users already have Stack Management access.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {eligible.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <Avatar user={u} muted />
                    <div>
                      <div className="font-medium">{u.full_name ?? u.email}</div>
                      <div className="font-mono text-xs text-muted-foreground">{u.email}</div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={busy === u.id}
                    onClick={() => grantAccess(u.id)}
                    className="gap-1.5"
                    style={{ background: "var(--sm-primary)", color: "var(--sm-primary-fg)" }}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Grant as {grantRole === "super_admin" ? "Super Admin" : "Viewer"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
