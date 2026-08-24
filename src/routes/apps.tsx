import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { logAction } from "@/lib/audit";
import { Wallet, Layers, LogOut, Sun, Moon, ArrowRight, Loader2 } from "lucide-react";

export const Route = createFileRoute("/apps")({
  component: AppSelector,
});

function AppSelector() {
  const { user, appAccess, loading, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    // Single-app users get redirected directly — set the flag first so
    // DashboardGuard at "/" knows the user came through the app selector.
    if (appAccess.length === 1) {
      sessionStorage.setItem("app_entry", "1");
      if (appAccess[0] === "petty_cash") navigate({ to: "/" });
      else navigate({ to: "/stack-management" });
    }
  }, [user, loading, appAccess, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasPettyCash = appAccess.includes("petty_cash");
  const hasStackMgmt = appAccess.includes("stack_management");

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="flex h-16 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-elegant overflow-hidden">
            <img src="/logo.png" alt="Cashflow Companion" className="h-full w-full object-contain p-0.5" />
          </div>
          <span className="font-display text-base tracking-tight">Cashflow Companion</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground"
            onClick={async () => {
              await logAction({ action: "user.logout" });
              await signOut();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="flex flex-col items-center px-4 py-16 sm:py-24">
        <div className="w-full max-w-2xl">
          <div className="mb-12 text-center">
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Cashflow Companion
            </div>
            <h1 className="mt-2 font-display text-3xl tracking-tight">Select an application</h1>
            <p className="mt-2 text-sm text-muted-foreground">{user.email}</p>
          </div>

          {!hasPettyCash && !hasStackMgmt ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Your account has not been granted access to any application yet.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Contact your administrator.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {hasPettyCash && (
                <AppCard
                  icon={Wallet}
                  name="Petty Cash"
                  description="Internal expense management, invoice tracking, cash control, and financial reports."
                  borderTop="border-t-primary"
                  dotClass="bg-primary"
                  onClick={() => {
                    sessionStorage.setItem("app_entry", "1");
                    navigate({ to: "/" });
                  }}
                />
              )}
              {hasStackMgmt && (
                <AppCard
                  icon={Layers}
                  name="Stack Management"
                  description="Software subscriptions, SaaS tracking, and technology stack visibility."
                  borderTop="border-t-[var(--sm-primary)]"
                  dotClass="bg-[var(--sm-primary)]"
                  onClick={() => {
                    sessionStorage.setItem("app_entry", "1");
                    navigate({ to: "/stack-management" });
                  }}
                />
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function AppCard({
  icon: Icon,
  name,
  description,
  borderTop,
  dotClass,
  onClick,
}: {
  icon: React.ElementType;
  name: string;
  description: string;
  borderTop: string;
  dotClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-col rounded-xl border-t-4 border border-border bg-card p-6 text-left shadow-elegant transition-all hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${borderTop}`}
    >
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${dotClass}/10`}>
          <Icon className="h-5 w-5" />
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <h2 className="mt-4 font-display text-lg">{name}</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-6 flex items-center gap-1.5 font-mono text-xs font-medium">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        Open application
      </div>
    </button>
  );
}
