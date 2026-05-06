import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { logAction } from "@/lib/audit";
import { toast } from "sonner";
import { Copy, Mail, Send, Trash2, Link2 } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/invitations")({
  component: () => <AppShell><Invitations /></AppShell>,
});

type Invite = {
  id: string;
  token: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

function Invitations() {
  const { role, user } = useAuth();
  const [items, setItems] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("invitations" as never)
      .select("*")
      .order("created_at", { ascending: false });
    setItems((data as Invite[]) ?? []);
  };

  useEffect(() => { if (role === "super_admin") load(); }, [role]);

  if (role !== "super_admin") {
    return <div className="text-sm text-muted-foreground">Invitations are restricted to Super Admin.</div>;
  }

  const linkFor = (token: string) =>
    `${window.location.origin}/accept-invite?token=${token}`;

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const expires_at = new Date(Date.now() + days * 86400_000).toISOString();
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          insert: (v: unknown) => { select: () => { single: () => Promise<{ data: Invite | null; error: Error | null }> } };
        };
      }).from("invitations").insert({ email: email.trim().toLowerCase(), expires_at, created_by: user.id }).select().single();
      if (error) throw error;
      const inv = data as Invite;
      await logAction({
        action: "invitation.created", entity_type: "invitation", entity_id: inv.id,
        new_state: { email: inv.email, expires_at }, metadata: { role: "viewer" },
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
    await logAction({ action: "invitation.copied", entity_type: "invitation", entity_id: inv.id, metadata: { email: inv.email } });
    toast.success("Link copied");
  };

  const sendMagicLink = async (inv: Invite) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: inv.email,
      options: { emailRedirectTo: linkFor(inv.token) },
    });
    if (error) { toast.error(error.message); return; }
    await logAction({ action: "invitation.magic_link_sent", entity_type: "invitation", entity_id: inv.id, metadata: { email: inv.email } });
    toast.success("Magic link sent");
  };

  const revoke = async (inv: Invite) => {
    const { error } = await supabase
      .from("invitations" as never)
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", inv.id);
    if (error) { toast.error(error.message); return; }
    await logAction({ action: "invitation.revoked", entity_type: "invitation", entity_id: inv.id, metadata: { email: inv.email } });
    toast.success("Invitation revoked");
    load();
  };

  const statusColor = (s: string) =>
    s === "used" ? "bg-success/15 text-success"
    : s === "expired" ? "bg-muted text-muted-foreground"
    : s === "revoked" ? "bg-destructive/15 text-destructive"
    : "bg-primary/15 text-primary";

  const effectiveStatus = (inv: Invite) =>
    inv.status === "pending" && new Date(inv.expires_at) < new Date() ? "expired" : inv.status;

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Onboarding</div>
        <h1 className="font-display text-3xl tracking-tight">Invite users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate single-use invite links. Invited users enter as <span className="font-medium">Viewer</span> by default. <Link to="/users" className="underline">Change roles →</Link>
        </p>
      </div>

      <Card className="p-5">
        <form onSubmit={create} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr,140px,auto]">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email to invite</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="days">Expires in (days)</Label>
            <Input id="days" type="number" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value))} />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={busy} className="gap-2"><Link2 className="h-4 w-4" />Generate invite</Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Invitations
        </div>
        {items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No invitations yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((inv) => {
              const st = effectiveStatus(inv);
              const active = st === "pending";
              return (
                <div key={inv.id} className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-[1fr,auto] sm:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{inv.email}</span>
                      <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${statusColor(st)}`}>{st}</span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">role: {inv.role}</span>
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                      created {format(new Date(inv.created_at), "MMM d, HH:mm")} · expires {format(new Date(inv.expires_at), "MMM d, HH:mm")}
                      {inv.used_at && <> · used {format(new Date(inv.used_at), "MMM d, HH:mm")}</>}
                    </div>
                    {active && (
                      <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={linkFor(inv.token)}>
                        {linkFor(inv.token)}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {active && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => copy(inv)} className="gap-1.5"><Copy className="h-3.5 w-3.5" />Copy</Button>
                        <Button size="sm" variant="outline" onClick={() => sendMagicLink(inv)} className="gap-1.5"><Mail className="h-3.5 w-3.5" />Email link</Button>
                        <Button size="sm" variant="ghost" onClick={() => revoke(inv)} className="gap-1.5 text-destructive"><Trash2 className="h-3.5 w-3.5" />Revoke</Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// avoid unused import warning when Send icon not used
void Send;
