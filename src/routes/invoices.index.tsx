import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "./index";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, FileText, Plus } from "lucide-react";
import { AccessDenied } from "@/components/AccessDenied";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/invoices/")({
  component: () => <AppShell><InvoicesGuard /></AppShell>,
});

function InvoicesGuard() {
  const { role, permissions } = useAuth();
  if (role !== "super_admin" && !permissions.includes("invoices")) return <AccessDenied icon={FileText} />;
  return <Invoices />;
}

const fmtCOP = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

type Inv = {
  id: string; invoice_number: string; amount: number; vendor: string;
  invoice_date: string; category: string; status: string; uploaded_by: string;
};

function Invoices() {
  const [items, setItems] = useState<Inv[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const { role } = useAuth();

  const load = () => {
    supabase.from("invoices").select("*").order("created_at", { ascending: false })
      .then(({ data }) => setItems((data as Inv[]) ?? []));
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("inv-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => items.filter((i) =>
    (status === "all" || i.status === status) &&
    (category === "all" || i.category === category) &&
    (q === "" || i.vendor.toLowerCase().includes(q.toLowerCase()) || i.invoice_number.toLowerCase().includes(q.toLowerCase()))
  ), [items, q, status, category]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Workflow</div>
          <h1 className="font-display text-3xl tracking-tight">Invoices</h1>
        </div>
        {(role === "super_admin" || role === "admin") && (
          <Link to="/upload">
            <Button className="bg-gradient-primary text-primary-foreground"><Plus className="mr-1.5 h-4 w-4" />New invoice</Button>
          </Link>
        )}
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr,180px,180px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search vendor or invoice #" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="under_review">Under review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {["office_supplies", "travel", "meals", "transport", "utilities", "maintenance", "marketing", "other"].map(c => (
                <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">No invoices match your filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((inv) => (
              <Link
                key={inv.id} to="/invoices/$id" params={{ id: inv.id }}
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-accent/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{inv.vendor}</span>
                    <StatusBadge status={inv.status} />
                  </div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">
                    {inv.invoice_number} · {format(new Date(inv.invoice_date + "T12:00:00"), "MMM d, yyyy")} · {inv.category.replace(/_/g, " ")}
                  </div>
                </div>
                <div className="font-num text-base font-semibold">{fmtCOP(Number(inv.amount))}</div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
