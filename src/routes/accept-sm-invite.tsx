import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Layers, ShieldCheck, Eye, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { z } from "zod";

const searchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute("/accept-sm-invite")({
  validateSearch: searchSchema,
  component: AcceptSMInvite,
});

type InviteInfo = {
  id: string; email: string; sm_role: string; status: string; expires_at: string;
};

function AcceptSMInvite() {
  const { token } = useSearch({ from: "/accept-sm-invite" });
  const { user, refreshRole } = useAuth();
  const navigate = useNavigate();

  const [inv, setInv] = useState<InviteInfo | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);

  // Load invitation metadata
  useEffect(() => {
    if (!token) { setError("no_token"); setChecking(false); return; }
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.rpc as any)("get_sm_invitation_by_token", { _token: token });
      if (!data || data.length === 0) { setError("not_found"); setChecking(false); return; }
      const row = (data as InviteInfo[])[0];
      if (row.status !== "pending") { setError(row.status); setChecking(false); return; }
      if (new Date(row.expires_at) < new Date()) { setError("expired"); setChecking(false); return; }
      setInv(row);
      setEmail(row.email);
      setChecking(false);
    })();
  }, [token]);

  // If user is already signed in with the right email, auto-accept
  useEffect(() => {
    if (!user || !inv || accepted) return;
    if (user.email?.toLowerCase() !== inv.email.toLowerCase()) return;
    void doAccept();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, inv]);

  const doAccept = async () => {
    if (!token) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.rpc as any)("accept_sm_invitation", { _token: token });
    const result = data as { ok?: boolean; error?: string; sm_role?: string };
    if (result?.ok) {
      setAccepted(true);
      await refreshRole();
      toast.success("Access granted! Redirecting…");
      setTimeout(() => navigate({ to: "/stack-management" }), 1500);
    } else {
      setError(result?.error ?? "unknown");
    }
  };

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // useEffect will pick up the new user and auto-accept
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  const signUp = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      toast.success("Account created — check your email to confirm, then sign in.");
      setMode("signin");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" data-app="stack">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" data-app="stack">
        <Card className="p-8 text-center max-w-sm w-full">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
          <h2 className="mt-3 font-display text-xl">Access granted</h2>
          <p className="mt-1 text-sm text-muted-foreground">Redirecting to Stack Management…</p>
        </Card>
      </div>
    );
  }

  const errorMessages: Record<string, string> = {
    no_token:      "This link is missing its invitation token.",
    not_found:     "This invitation was not found.",
    used:          "This invitation has already been used.",
    revoked:       "This invitation has been revoked.",
    expired:       "This invitation has expired.",
    email_mismatch:"Your account email does not match this invitation.",
    invalid_status:"This invitation is no longer valid.",
  };

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" data-app="stack">
        <Card className="p-8 text-center max-w-sm w-full">
          <XCircle className="mx-auto h-10 w-10 text-destructive" />
          <h2 className="mt-3 font-display text-xl">Invitation invalid</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {errorMessages[error] ?? "This invitation link is not valid."}
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate({ to: "/login" })}>
            Go to sign in
          </Button>
        </Card>
      </div>
    );
  }

  const RoleIcon = inv!.sm_role === "super_admin" ? ShieldCheck : Eye;
  const roleLabel = inv!.sm_role === "super_admin" ? "Super Admin" : "Viewer";

  // If user is signed in but wrong email
  if (user && user.email?.toLowerCase() !== inv!.email.toLowerCase()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" data-app="stack">
        <Card className="p-8 text-center max-w-sm w-full">
          <XCircle className="mx-auto h-10 w-10 text-destructive" />
          <h2 className="mt-3 font-display text-xl">Wrong account</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This invitation is for <strong>{inv!.email}</strong>.<br />
            You are signed in as <strong>{user.email}</strong>.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={async () => {
            await supabase.auth.signOut();
          }}>
            Sign out and switch account
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4" data-app="stack">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl sm-icon-bg">
            <Layers className="h-7 w-7 sm-icon-fg" />
          </div>
          <h1 className="font-display text-2xl tracking-tight">You've been invited</h1>
          <p className="mt-1 text-sm text-muted-foreground">to Stack Management</p>
        </div>

        {/* Invitation card */}
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <RoleIcon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--sm-primary)" }} />
            <div>
              <div className="font-medium">{inv!.email}</div>
              <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                Role: <span className="font-semibold">{roleLabel}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Auth form */}
        <Card className="p-5">
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${mode === "signin" ? "sm-nav-active" : "text-muted-foreground hover:text-foreground"}`}
            >
              Sign in
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${mode === "signup" ? "sm-nav-active" : "text-muted-foreground hover:text-foreground"}`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={mode === "signin" ? signIn : signUp} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="acc-email">Email</Label>
              <Input
                id="acc-email"
                type="email"
                value={email}
                disabled
                className="bg-muted/40"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-pw">Password</Label>
              <Input
                id="acc-pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="••••••••"
              />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="w-full"
              style={{ background: "var(--sm-primary)", color: "var(--sm-primary-fg)" }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signin" ? "Sign in & accept" : "Create account"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
