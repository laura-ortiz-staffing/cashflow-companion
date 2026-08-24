import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Layers, Repeat2, LogOut, Sun, Moon, Menu, X, LayoutDashboard,
  ChevronLeft, Users, Mail, Plus, Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logAction } from "@/lib/audit";

export function StackManagementShell({ children }: { children: ReactNode }) {
  const { user, smRole, appAccess, loading, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const { location } = useRouterState();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    if (appAccess.length > 0 && !appAccess.includes("stack_management")) {
      navigate({ to: appAccess.includes("petty_cash") ? "/" : "/apps" });
    }
  }, [user, loading, appAccess, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center" data-app="stack">
        <div className="font-display text-sm text-muted-foreground tracking-widest">LOADING…</div>
      </div>
    );
  }

  const isSuperAdmin = smRole === "super_admin";
  const hasPettyCash = appAccess.includes("petty_cash");

  const nav = [
    { to: "/stack-management",               icon: LayoutDashboard, label: "Dashboard",     exact: true,  superOnly: false },
    { to: "/stack-management/subscriptions", icon: Repeat2,         label: "Subscriptions", exact: false, superOnly: false },
    { to: "/stack-management/create",        icon: Plus,            label: "Create",        exact: false, superOnly: true  },
    { to: "/stack-management/members",       icon: Users,           label: "Members",       exact: false, superOnly: false },
    { to: "/stack-management/ai",            icon: Cpu,             label: "AI",            exact: false, superOnly: false },
    { to: "/stack-management/invitations",   icon: Mail,            label: "Invitations",   exact: false, superOnly: true  },
    { to: "/stack-management/users",         icon: Users,           label: "Users",         exact: false, superOnly: true  },
  ].filter((item) => !item.superOnly || isSuperAdmin);

  return (
    <div className="min-h-screen bg-background" data-app="stack">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 border-r flex flex-col transition-transform duration-200 sm-sidebar sm-sidebar-border",
          "lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Brand */}
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-5 sm-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg sm-icon-bg">
              <Layers className="h-4 w-4 sm-icon-fg" />
            </div>
            <div className="flex flex-col">
              <span className="font-display text-sm leading-tight tracking-tight sm-brand-fg">
                Stack
              </span>
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                Management
              </span>
            </div>
          </div>
          <button className="lg:hidden" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 min-h-0 overflow-y-auto space-y-0.5 p-3">
          {nav.map((item) => {
            const active = item.exact
              ? location.pathname === item.to
              : location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  active ? "sm-nav-active" : "sm-nav-inactive",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="shrink-0 mx-3 mb-3 rounded-xl border sm-sidebar-border bg-card/40 p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm text-white sm-avatar">
              {(user.email?.[0] ?? "?").toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{user.email}</div>
              <div className="mt-0.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-mono tracking-wider sm-role-badge">
                {smRole === "super_admin" ? "SUPER ADMIN" : "VIEWER"}
              </div>
            </div>
          </div>
          {hasPettyCash && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full justify-start gap-2 text-muted-foreground"
              onClick={() => navigate({ to: "/apps" })}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Back to apps
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full justify-start gap-2 text-muted-foreground"
            onClick={async () => {
              await logAction({ action: "user.logout" });
              await signOut();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
          <button className="lg:hidden" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
