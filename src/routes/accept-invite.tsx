import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { logAction } from "@/lib/audit";
import { Wallet, ShieldCheck, AlertCircle } from "lucide-react";

const search = z.object({ token: z.string().optional() });

export const Route = createFileRoute("/accept-invite")({
  validateSearch: search,
  component: AcceptInvite,
});

type Info = { email: string; status: string; expires_at: string; role: string } | null;

function AcceptInvite() {
  const { token } = useSearch({ from: "/accept-invite" });
  const { user, refreshRole } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState<Info>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token) { setError("Missing invitation token."); setLoading(false); return; }
      const { data, error } = await supabase.rpc("get_invitation_by_token", { _token: token });
      if (error) { setError(error.message); setLoading(false); return; }
      const row = (data as Info[] | null)?.[0] ?? null;
      if (!row) { setError("This invitation does not exist."); setLoading(false); return; }
      const expired = new Date(row.expires_at) < new Date();
      if (row.status === "used") setError("This invitation link has already been used.");
      else if (row.status === "revoked") setError("This invitation has been revoked.");
      else if (expired || row.status === "expired") setError("This invitation has expired.");
      else setInfo(row);
      setLoading(false);
    })();
  }, [token]);

  // If user already signed in and invite valid, auto-redeem
  useEffect(() => {
    if (!user || !info || !token) return;
    if (user.email?.toLowerCase() !== info.email.toLowerCase()) {
      setError(`You are signed in as ${user.email}, but this invitation is for ${info.email}.`);
      return;
    }
    redeem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, info, token]);

  const redeem = async () => {
    if (!token) return;
    const { data, error } = await supabase.rpc("accept_invitation", { _token: token });
    if (error) { toast.error(error.message); return; }
    const res = data as { ok: boolean; error?: string; role?: string };
    if (!res.ok) {
      setError(res.error ?? "Could not accept invitation.");
      return;
    }
    await logAction({ action: "user.login_from_invitation", metadata: { token_prefix: token.slice(0, 8) } });
    await refreshRole();
    toast.success("Welcome! You're in as Viewer.");
    navigate({ to: "/" });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!info) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: info.email,
          password,
          options: { emailRedirectTo: window.location.href, data: { full_name: fullName } },
        });
        if (error) throw error;
        toast.success("Account created. Signing you in…");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: info.email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-primary">
            <Wallet className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display text-lg">Petty Cash</span>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Validating invitation…</div>
        ) : error ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-destructive">
              <AlertCircle className="mt-0.5 h-5 w-5" />
              <div>
                <div className="font-display text-lg">Invitation problem</div>
                <p className="text-sm">{error}</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate({ to: "/login" })}>Go to sign in</Button>
          </div>
        ) : info ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-success" />
              <div>
                <div className="font-display text-lg">You've been invited</div>
                <p className="text-sm text-muted-foreground">
                  Set up access for <span className="font-medium">{info.email}</span>. You will enter as <span className="font-medium">{info.role}</span>.
                </p>
              </div>
            </div>

            {!user ? (
              <form onSubmit={submit} className="space-y-3">
                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Full name</Label>
                    <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input value={info.email} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" disabled={busy} className="w-full bg-gradient-primary text-primary-foreground">
                  {busy ? "…" : mode === "signup" ? "Create account" : "Sign in"}
                </Button>
                <div className="text-center text-sm text-muted-foreground">
                  {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
                  <button type="button" className="underline" onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>
                    {mode === "signup" ? "Sign in" : "Create account"}
                  </button>
                </div>
              </form>
            ) : (
              <Button onClick={redeem} className="w-full">Accept invitation</Button>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
