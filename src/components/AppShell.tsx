import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, FileText, Upload, ScrollText, Bell, LogOut, Sun, Moon, Menu, X, Wallet, Users, Coins, Inbox, FileSpreadsheet, HelpCircle, UserPlus, Bot
} from "lucide-react";
import { WhatsAppBubble } from "@/components/WhatsAppBubble";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { logAction } from "@/lib/audit";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, role, permissions, loading, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const { location } = useRouterState();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  // Realtime notifications for super admin
  useEffect(() => {
    if (!user || role !== "super_admin") return;
    const load = async () => {
      const { count } = await supabase
        .from("notifications").select("*", { count: "exact", head: true })
        .eq("recipient_id", user.id).eq("read", false);
      setUnread(count ?? 0);
    };
    load();
    const ch = supabase
      .channel("notif-" + user.id)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "notifications",
        filter: `recipient_id=eq.${user.id}`,
      }, (payload) => {
        setUnread((n) => n + 1);
        const p = payload.new as { title: string; message: string };
        toast(p.title, { description: p.message });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, role]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="font-display text-sm text-muted-foreground tracking-widest">LOADING…</div>
      </div>
    );
  }

  const nav = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard", roles: ["super_admin"] },
    { to: "/invoices", icon: FileText, label: "Invoices", roles: ["super_admin", "admin", "viewer"], requirePermission: "invoices" },
    { to: "/cash", icon: Coins, label: "Cash control", roles: ["super_admin", "admin", "viewer"] },
    { to: "/upload", icon: Upload, label: "Upload", roles: ["super_admin", "admin", "viewer"], adminPermission: "upload" },
    { to: "/requests", icon: Inbox, label: "Requests", roles: ["super_admin", "admin", "viewer"], requirePermission: "requests" },
    { to: "/reports", icon: ScrollText, label: "Reports", roles: ["super_admin", "admin", "viewer"], requirePermission: "reports", adminDefault: true },
    { to: "/sync", icon: FileSpreadsheet, label: "Excel Sync", roles: ["super_admin", "admin", "viewer"], requirePermission: "sync" },
    { to: "/qa", icon: HelpCircle, label: "Q&A", roles: ["super_admin", "admin"] },
    { to: "/whatsapp", icon: Bot, label: "App Bot", roles: ["super_admin", "admin"] },
    { to: "/audit", icon: Bell, label: "Audit Log", roles: ["super_admin"] },
    { to: "/invitations", icon: UserPlus, label: "Invite users", roles: ["super_admin"] },
    { to: "/users", icon: Users, label: "Users", roles: ["super_admin"] },
  ].filter((i) => {
    if (!role || !i.roles.includes(role)) return false;
    if (role === "admin" && (i as Record<string, unknown>).adminPermission) {
      return permissions.includes((i as Record<string, unknown>).adminPermission as string);
    }
    if (i.requirePermission && role !== "super_admin") {
      if (role === "admin" && (i as Record<string, unknown>).adminDefault) return true;
      return permissions.includes(i.requirePermission);
    }
    return true;
  });

  const roleLabel = role === "super_admin" ? "SUPER ADMIN" : role === "admin" ? "ADMIN" : "VIEWER";
  const roleColor = role === "super_admin" ? "bg-tertiary text-tertiary-foreground" : role === "admin" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground";

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 border-r border-sidebar-border bg-sidebar transition-transform duration-200",
        "lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-16 items-center justify-between gap-2 border-b border-sidebar-border px-5">
          <Link to="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-glow overflow-hidden">
              <img src="/logo.png" alt="petty cash" className="h-full w-full object-contain p-0.5" />
            </div>
            <span className="font-display text-base tracking-tight text-primary">petty cash</span>
          </Link>
          <button className="lg:hidden" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="space-y-1 p-3">
          {nav.map((item) => {
            const active = location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {item.to === "/audit" && unread > 0 && (
                  <span className="rounded-full bg-tertiary px-1.5 py-0.5 text-[10px] font-mono text-tertiary-foreground">
                    {unread}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="absolute inset-x-3 bottom-3 rounded-xl border border-sidebar-border bg-card/40 p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-tertiary font-display text-sm text-primary-foreground">
              {(user.email?.[0] ?? "?").toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{user.email}</div>
              <div className={cn("mt-0.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-mono tracking-wider", roleColor)}>
                {roleLabel}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="mt-2 w-full justify-start gap-2" onClick={async () => { await logAction({ action: "user.logout" }); await signOut(); navigate({ to: "/login" }); }}>
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />}

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
      <WhatsAppBubble />
    </div>
  );
}
