import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Mail } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reset email");
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

        {sent ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/10">
                <Mail className="h-5 w-5 text-success" />
              </div>
              <div>
                <h2 className="font-display text-xl">Check your email</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  We sent a reset link to <span className="font-medium">{email}</span>. It expires in 1 hour.
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Didn't receive it? Check your spam folder or contact your administrator.
            </p>
            <Link to="/login">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to sign in
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <h2 className="font-display text-2xl">Reset password</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your email and we'll send you a reset link.
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="you@example.com"
                />
              </div>
              <Button
                type="submit"
                disabled={busy}
                className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90"
              >
                {busy ? "Sending…" : "Send reset link"}
              </Button>
            </form>

            <div className="mt-5 text-center">
              <Link
                to="/login"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to sign in
              </Link>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
