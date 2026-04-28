import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";
import { Activity, Search } from "lucide-react";

export const Route = createFileRoute("/audit")({
  component: () => <AppShell><Audit /></AppShell>,
});

type Log = {
  id: string;
  user_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
};

const MODULES = ["all", "invoice", "request", "cash_settings", "user", "report", "session"];

function moduleOf(action: string, entity_type: string | null) {
  if (entity_type) return entity_type;
  const prefix = action.split(".")[0];
  return prefix || "other";
}

function Audit() {
  const { role } = useAuth();
  const [logs, setLogs] = useState<Log[]>([]);
  const [q, setQ] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = () => {
    supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(500)
      .then(({ data }) => setLogs((data as Log[]) ?? []));
  };

  useEffect(() => {
    if (role !== "super_admin") return;
    load();
    supabase.from("notifications").update({ read: true }).eq("read", false).then(() => {});

    const ch = supabase.channel("audit-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs" }, (payload) => {
        setLogs((curr) => [payload.new as Log, ...curr].slice(0, 500));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [role]);

  const actionOptions = useMemo(() => {
    const set = new Set<string>(["all"]);
    logs.forEach((l) => set.add(l.action));
    return Array.from(set);
  }, [logs]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (moduleFilter !== "all" && moduleOf(l.action, l.entity_type) !== moduleFilter) return false;
      if (actionFilter !== "all" && l.action !== actionFilter) return false;
      if (from && new Date(l.created_at) < new Date(from)) return false;
      if (to && new Date(l.created_at) > new Date(to + "T23:59:59")) return false;
      if (q) {
        const hay = `${l.action} ${l.user_email ?? ""} ${l.entity_type ?? ""} ${JSON.stringify(l.metadata ?? {})}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [logs, q, moduleFilter, actionFilter, from, to]);

  if (role !== "super_admin") {
    return <div className="text-sm text-muted-foreground">Audit log is restricted to Super Admin.</div>;
  }

  const colorFor = (action: string) => {
    if (action.includes("approved")) return "text-success";
    if (action.includes("rejected") || action.includes("failed")) return "text-destructive";
    if (action.includes("upload") || action.includes("created")) return "text-primary";
    if (action.includes("login") || action.includes("logout")) return "text-tertiary";
    return "text-muted-foreground";
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Compliance</div>
        <h1 className="font-display text-3xl tracking-tight">Activity log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real-time, immutable record of every action across the system.
        </p>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr,160px,200px,160px,160px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search user, action, metadata…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger><SelectValue placeholder="Module" /></SelectTrigger>
            <SelectContent>
              {MODULES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger><SelectValue placeholder="Action" /></SelectTrigger>
            <SelectContent>
              {actionOptions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        </div>
        <div className="mt-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {filtered.length} of {logs.length} events
        </div>
      </Card>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Activity className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">No activity matches your filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((l) => (
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
                    {l.entity_type && (
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {l.entity_type}
                      </span>
                    )}
                  </div>
                  {(l.previous_state || l.new_state) && (
                    <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {l.previous_state && (
                        <div className="rounded border border-border/50 bg-muted/20 p-2 font-mono text-[11px]">
                          <div className="mb-1 uppercase tracking-wider text-muted-foreground">previous</div>
                          {Object.entries(l.previous_state).slice(0, 5).map(([k, v]) => (
                            <div key={k}><span className="text-muted-foreground">{k}=</span>{String(v)}</div>
                          ))}
                        </div>
                      )}
                      {l.new_state && (
                        <div className="rounded border border-border/50 bg-muted/20 p-2 font-mono text-[11px]">
                          <div className="mb-1 uppercase tracking-wider text-muted-foreground">new</div>
                          {Object.entries(l.new_state).slice(0, 5).map(([k, v]) => (
                            <div key={k}><span className="text-muted-foreground">{k}=</span>{String(v)}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
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
