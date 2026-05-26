import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { logAction } from "@/lib/audit";
import { KeyRound, AlertCircle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

type PageState = "loading" | "ready" | "invalid" | "done";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Supabase processes the #access_token hash on page load and fires PASSWORD_RECOVERY
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        setPageState("ready");
      }
    });

    // If no PASSWORD_RECOVERY event fires within 4s the link is invalid/expired
    const timeout = setTimeout(() => {
      setPageState((s) => (s === "loading" ? "invalid" : s));
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await logAction({ action: "user.password_reset", metadata: {} });
      setPageState("done");
      toast.success("Password updated successfully");
      setTimeout(() => navigate({ to: "/" }), 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white overflow-hidden shadow-sm">
            <img src="/logo.png" alt="petty cash" className="h-full w-full object-contain p-0.5" />
          </div>
          <span className="font-display text-lg text-primary">petty cash</span>
        </div>

        {pageState === "loading" && (
          <p className="text-sm text-muted-foreground">Validating reset link…</p>
        )}

        {pageState === "invalid" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 text-destructive">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <h2 className="font-display text-lg">Invalid or expired link</h2>
                <p className="mt-1 text-sm">
                  This password reset link is no longer valid. Please request a new one.
                </p>
              </div>
            </div>
            <Link to="/forgot-password">
              <Button variant="outline" className="w-full">Request new link</Button>
            </Link>
          </div>
        )}

        {pageState === "ready" && (
          <>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <KeyRound className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-display text-xl">Set new password</h2>
                <p className="text-sm text-muted-foreground">Choose a strong password of at least 8 characters.</p>
              </div>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                />
                {confirm && password !== confirm && (
                  <p className="text-xs text-destructive">Passwords do not match</p>
                )}
              </div>
              <Button
                type="submit"
                disabled={busy || (confirm.length > 0 && password !== confirm)}
                className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90"
              >
                {busy ? "Updating…" : "Update password"}
              </Button>
            </form>
          </>
        )}

        {pageState === "done" && (
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <div>
              <h2 className="font-display text-lg">Password updated</h2>
              <p className="mt-1 text-sm text-muted-foreground">Redirecting you to the dashboard…</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
