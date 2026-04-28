import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/audit")({
  component: () => <AppShell><Audit /></AppShell>,
});

type Log = {
  id: string; user_email: string | null; action: string;
  entity_type: string | null; entity_id: string | null;
  metadata: Record<string, unknown> | null; created_at: string;
};

function Audit() {
  const { role } = useAuth();
  const [logs, setLogs] = useState<Log[]>([]);

  useEffect(() => {
    if (role !== "super_admin") return;
    supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => setLogs((data as Log[]) ?? []));

    // mark notifications as read
    supabase.from("notifications").update({ read: true })
      .eq("read", false).then(() => {});
  }, [role]);

  if (role !== "super_admin") {
    return <div className="text-sm text-muted-foreground">Audit log is restricted to Super Admin.</div>;
  }

  const colorFor = (action: string) => {
    if (action.includes("approved")) return "text-success";
    if (action.includes("rejected")) return "text-destructive";
    if (action.includes("upload")) return "text-primary";
    if (action.includes("login")) return "text-tertiary";
    return "text-muted-foreground";
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Compliance</div>
        <h1 className="font-display text-3xl tracking-tight">Audit log</h1>
        <p className="mt-1 text-sm text-muted-foreground">Immutable record of every action across the system.</p>
      </div>

      <Card className="overflow-hidden">
        {logs.length === 0 ? (
          <div className="p-12 text-center">
            <Activity className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">No activity recorded yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {logs.map((l) => (
              <div key={l.id} className="grid grid-cols-1 gap-2 px-5 py-4 sm:grid-cols-[160px,1fr] sm:gap-6">
                <div className="font-mono text-xs text-muted-foreground">
                  {format(new Date(l.created_at), "MMM d, HH:mm:ss")}
                </div>
                <div>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className={`font-mono text-xs uppercase tracking-wider ${colorFor(l.action)}`}>
                      {l.action}
                    </span>
                    <span className="text-sm">{l.user_email ?? "system"}</span>
                  </div>
                  {l.metadata && Object.keys(l.metadata).length > 0 && (
                    <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {Object.entries(l.metadata).slice(0, 4).map(([k, v]) => `${k}=${String(v)}`).join(" · ")}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
