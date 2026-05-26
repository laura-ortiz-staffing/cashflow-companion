import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Wallet, Shield, Activity } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { toast } from "sonner";
import { logAction } from "@/lib/audit";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        await logAction({ action: "user.login_failed", metadata: { email, reason: error.message } });
        throw error;
      }
      toast.success("Welcome back");
      await logAction({ action: "user.login", metadata: { email } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      {/* Left visual */}
      <div className="relative hidden flex-1 items-center justify-center overflow-hidden bg-gradient-primary p-12 lg:flex">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 25% 30%, white 0%, transparent 40%), radial-gradient(circle at 75% 70%, white 0%, transparent 35%)" }} />
        <div className="relative z-10 max-w-md text-primary-foreground">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white backdrop-blur overflow-hidden">
              <img src="/logo.png" alt="petty cash" className="h-full w-full object-contain p-1" />
            </div>
            <span className="font-display text-2xl tracking-tight">petty cash</span>
          </div>
          <h1 className="font-display text-4xl leading-[1.1] tracking-tight">
            Petty cash,<br/>
            <span className="opacity-70">under control.</span>
          </h1>
          <p className="mt-4 text-base opacity-80">
            Centralized invoice intake, validation, approval, and audit — built for finance teams that need traceability.
          </p>
          <div className="mt-10 space-y-4">
            {[
              { icon: Shield, title: "Audit-ready", desc: "Every action logged, immutable trail." },
              { icon: Activity, title: "Real-time control", desc: "Live notifications for approvers." },
              { icon: Wallet, title: "Locked records", desc: "Approved invoices can't be tampered with." },
            ].map((f) => (
              <div key={f.title} className="flex items-start gap-3 rounded-xl border border-white/15 bg-white/5 p-4 backdrop-blur">
                <f.icon className="mt-0.5 h-5 w-5 opacity-80" />
                <div>
                  <div className="font-display text-sm">{f.title}</div>
                  <div className="text-xs opacity-70">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form */}
      <div className="flex flex-1 items-center justify-center p-6 sm:p-12">
        <Card className="w-full max-w-md border-border/60 p-8 shadow-elegant">
          <div className="mb-6 lg:hidden">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white overflow-hidden shadow-sm">
                <img src="/logo.png" alt="petty cash" className="h-full w-full object-contain p-0.5" />
              </div>
              <span className="font-display text-lg text-primary">petty cash</span>
            </div>
          </div>
          <h2 className="font-display text-2xl">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome back. Continue to your dashboard.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Forgot password?
                </Link>
              </div>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
            <Button type="submit" disabled={busy} className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90">
              {busy ? "…" : "Sign in"}
            </Button>
          </form>

          <div className="mt-5 text-center text-sm text-muted-foreground">
            Contact your administrator if you need access.
          </div>
        </Card>
      </div>
    </div>
  );
}
