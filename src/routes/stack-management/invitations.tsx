import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { logAction } from "@/lib/audit";
import { toast } from "sonner";
import { Copy, Mail, Trash2, ShieldCheck, Eye, Link2 } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/stack-management/invitations")({
  component: SMInvitations,
});

type Invite = {
  id: string; token: string; email: string; sm_role: string;
  status: string; expires_at: string; used_at: string | null;
  revoked_at: string | null; created_at: string;
};

function SMInvitations() {
  const { smRole, user } = useAuth();
  const [items, setItems] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"super_admin" | "viewer">("viewer");
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("sm_invitations")
      .select("*")
      .order("created_at", { ascending: false });
    setItems((data as Invite[]) ?? []);
  };

  useEffect(() => { if (smRole === "super_admin") load(); }, [smRole]);

  if (smRole !== "super_admin") {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        Invitations are restricted to Super Admin.
      </div>
    );
  }

  const linkFor = (token: string) =>
    `${window.location.origin}/accept-sm-invite?token=${token}`;

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const expires_at = new Date(Date.now() + days * 86_400_000).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("sm_invitations")
        .insert({ email: email.trim().toLowerCase(), sm_role: role, expires_at, created_by: user.id })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") {
          toast.error("An active invitation for this email already exists.");
        } else {
          throw error;
        }
        return;
      }
      const inv = data as Invite;
      await logAction({
        action: "sm_invitation.created",
        entity_type: "sm_invitation",
        entity_id: inv.id,
        new_state: { email: inv.email, sm_role: role, expires_at },
      });
      toast.success("Invitation created");
      setEmail("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create invitation");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (inv: Invite) => {
    await navigator.clipboard.writeText(linkFor(inv.token));
    await logAction({ action: "sm_invitation.copied", entity_type: "sm_invitation", entity_id: inv.id, metadata: { email: inv.email } });
    toast.success("Link copied");
  };

  const sendMagicLink = async (inv: Invite) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: inv.email,
      options: { emailRedirectTo: linkFor(inv.token) },
    });
    if (error) { toast.error(error.message); return; }
    await logAction({ action: "sm_invitation.magic_link_sent", entity_type: "sm_invitation", entity_id: inv.id, metadata: { email: inv.email } });
    toast.success("Magic link sent to " + inv.email);
  };

  const revoke = async (inv: Invite) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("sm_invitations")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", inv.id);
    if (error) { toast.error(error.message); return; }
    await logAction({ action: "sm_invitation.revoked", entity_type: "sm_invitation", entity_id: inv.id, metadata: { email: inv.email } });
    toast.success("Invitation revoked");
    load();
  };

  const effectiveStatus = (inv: Invite) =>
    inv.status === "pending" && new Date(inv.expires_at) < new Date() ? "expired" : inv.status;

  const statusColor = (s: string) =>
    s === "used"    ? "bg-success/15 text-success"
    : s === "expired" ? "bg-muted text-muted-foreground"
    : s === "revoked" ? "bg-destructive/15 text-destructive"
    : "bg-[color-mix(in_oklab,var(--sm-primary)_12%,transparent)] text-[var(--sm-primary)]";

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Stack Management
        </div>
        <h1 className="font-display text-3xl tracking-tight">Invitations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite users to Stack Management. Each invitation grants access only to this application.
        </p>
      </div>

      <Card className="p-5">
        <form onSubmit={create} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr,180px,120px,auto]">
          <div className="space-y-1.5">
            <Label htmlFor="inv-email">Email address</Label>
            <Input
              id="inv-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@company.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "super_admin" | "viewer")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">
                  <span className="flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5" /> Viewer
                  </span>
                </SelectItem>
                <SelectItem value="super_admin">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" /> Super Admin
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-days">Expires (days)</Label>
            <Input
              id="inv-days"
              type="number"
              min={1}
              max={30}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={busy}
              className="gap-2"
              style={{ background: "var(--sm-primary)", color: "var(--sm-primary-fg)" }}
            >
              <Link2 className="h-4 w-4" />
              Generate
            </Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Invitations ({items.length})
        </div>
        {items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No invitations yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((inv) => {
              const st = effectiveStatus(inv);
              const active = st === "pending";
              const RoleIcon = inv.sm_role === "super_admin" ? ShieldCheck : Eye;
              return (
                <div key={inv.id} className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-[1fr,auto] sm:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{inv.email}</span>
                      <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${statusColor(st)}`}>
                        {st}
                      </span>
                      <span className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider bg-muted text-muted-foreground">
                        <RoleIcon className="h-2.5 w-2.5" />
                        {inv.sm_role === "super_admin" ? "Super Admin" : "Viewer"}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                      created {format(new Date(inv.created_at), "MMM d, HH:mm")} · expires{" "}
                      {format(new Date(inv.expires_at), "MMM d, HH:mm")}
                      {inv.used_at && <> · used {format(new Date(inv.used_at), "MMM d, HH:mm")}</>}
                    </div>
                    {active && (
                      <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={linkFor(inv.token)}>
                        {linkFor(inv.token)}
                      </div>
                    )}
                  </div>
                  {active && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => copy(inv)} className="gap-1.5">
                        <Copy className="h-3.5 w-3.5" /> Copy link
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => sendMagicLink(inv)} className="gap-1.5">
                        <Mail className="h-3.5 w-3.5" /> Email link
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => revoke(inv)} className="gap-1.5 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" /> Revoke
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
