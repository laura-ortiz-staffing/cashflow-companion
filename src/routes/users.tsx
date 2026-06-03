import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { logAction } from "@/lib/audit";
import { FileDown, Upload } from "lucide-react";

export const Route = createFileRoute("/users")({
  component: () => (
    <AppShell>
      <Users />
    </AppShell>
  ),
});

type Profile = { id: string; email: string; full_name: string | null; created_at: string };
type RoleRow = { user_id: string; role: "super_admin" | "admin" | "viewer" };

function Users() {
  const { role: myRole, user: me } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [allPerms, setAllPerms] = useState<Set<string>>(new Set());

  const load = async () => {
    const { data: ps } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true });
    setProfiles((ps as Profile[]) ?? []);
    const { data: rs } = await supabase.from("user_roles").select("user_id, role");
    const map: Record<string, string> = {};
    ((rs as RoleRow[]) ?? []).forEach((r) => {
      map[r.user_id] = r.role;
    });
    setRoles(map);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: perms } = await (supabase.from as any)("user_permissions").select(
      "user_id,permission",
    );
    setAllPerms(
      new Set(
        ((perms ?? []) as { user_id: string; permission: string }[]).map(
          (p) => `${p.user_id}:${p.permission}`,
        ),
      ),
    );
  };

  useEffect(() => {
    if (myRole === "super_admin") load();
  }, [myRole]);

  const togglePerm = async (userId: string, currentRole: string, permission: string) => {
    if (currentRole === "super_admin") return;
    const key = `${userId}:${permission}`;
    const has = allPerms.has(key);
    if (has) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from as any)("user_permissions")
        .delete()
        .eq("user_id", userId)
        .eq("permission", permission);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from as any)("user_permissions").insert({
        user_id: userId,
        permission,
        granted_by: me?.id,
      });
    }
    load();
  };

  if (myRole !== "super_admin") {
    return (
      <div className="text-sm text-muted-foreground">
        User management is restricted to Super Admin.
      </div>
    );
  }

  const updateRole = async (userId: string, newRole: string) => {
    const prev = roles[userId];
    if (prev === newRole) return;
    if (userId === me?.id && prev === "super_admin") {
      toast.error("You can't demote yourself.");
      return;
    }
    // delete old, insert new
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role: newRole as "viewer" });
    if (error) {
      toast.error(error.message);
      return;
    }
    await logAction({
      action: "user.role_change",
      entity_type: "user",
      entity_id: userId,
      previous_state: { role: prev },
      new_state: { role: newRole },
    });
    toast.success("Role updated");
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Access control
        </div>
        <h1 className="font-display text-3xl tracking-tight">Users & roles</h1>
        <p className="mt-1 text-sm text-muted-foreground">Assign permissions across the team.</p>
      </div>

      <Card className="overflow-hidden">
        <div className="divide-y divide-border">
          {profiles.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-tertiary font-display text-sm text-primary-foreground">
                  {(p.full_name?.[0] ?? p.email[0]).toUpperCase()}
                </div>
                <div>
                  <div className="font-medium">{p.full_name ?? p.email}</div>
                  <div className="font-mono text-xs text-muted-foreground">{p.email}</div>
                </div>
              </div>
              <Select value={roles[p.id] ?? "viewer"} onValueChange={(v) => updateRole(p.id, v)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </Card>

      {/* Permissions section */}
      <div>
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Permissions
        </div>
        <h2 className="font-display text-xl tracking-tight">Section access</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Click a section to grant or revoke access. Super Admins always have full access.
        </p>
      </div>

      <Card className="divide-y divide-border overflow-hidden">
        {profiles.map((p) => {
          const userRole = roles[p.id] ?? "viewer";
          const isSuperAdmin = userRole === "super_admin";
          return (
            <div key={p.id} className="px-5 py-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-tertiary font-display text-sm text-primary-foreground shrink-0">
                  {(p.full_name?.[0] ?? p.email[0]).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.full_name ?? p.email}</div>
                  <div className="font-mono text-xs text-muted-foreground truncate">{p.email}</div>
                </div>
              </div>
              {isSuperAdmin ? (
                <p className="text-xs text-muted-foreground italic">Full access to all sections</p>
              ) : userRole === "viewer" ? (
                <p className="text-xs text-muted-foreground italic">
                  Upload invoices &amp; inflows only. No configurable permissions.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {ADMIN_PERM_TABS.map((t) => {
                    const has = allPerms.has(`${p.id}:${t.key}`);
                    return (
                      <button
                        key={t.key}
                        onClick={() => togglePerm(p.id, userRole, t.key)}
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          has
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted"
                        }`}
                      >
                        <t.icon className="h-3 w-3" />
                        {t.label}
                        {has && <span className="ml-0.5 opacity-60">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}

const ADMIN_PERM_TABS = [
  { key: "upload", label: "Upload invoices", icon: Upload },
  { key: "reports_download", label: "Download report", icon: FileDown },
] as const;
