import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Loader2, FileDown, Printer, BarChart2 } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { downloadWorkbook } from "@/lib/excel";
import ExcelJS from "exceljs";

export const Route = createFileRoute("/stack-management/reports")({
  component: Reports,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type PaymentLog = {
  id: string;
  subscription_id: string;
  amount: number;
  payment_date: string;
  payment_method: "petty_cash" | "corporate_card";
  reference: string | null;
  notes: string | null;
  subscriptions: {
    name: string;
    vendor: string | null;
    category: string | null;
    currency: string;
    license_count: number | null;
  } | null;
};

type Assignment = {
  id: string;
  subscription_id: string;
  assigned_email: string | null;
  assigned_name: string | null;
  assignee_type: string;
  assignee_ref: string | null;
  status: "active" | "revoked";
  assigned_at: string;
  subscriptions: { name: string; vendor: string | null; category: string | null } | null;
};

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtCOP = (n: number) =>
  "COP " + new Intl.NumberFormat("es-CO", { style: "decimal", maximumFractionDigits: 0 }).format(n);

const fmtUSD = (n: number) =>
  "USD " + new Intl.NumberFormat("en-US", { style: "decimal", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtAmt = (n: number, currency: string) =>
  currency === "USD" ? fmtUSD(n) : fmtCOP(n);

const PM_LABEL: Record<string, string> = {
  petty_cash: "Petty cash",
  corporate_card: "Corporate card",
};

const PM_PILL: Record<string, string> = {
  petty_cash: "text-[var(--sm-primary)] bg-[color-mix(in_oklab,var(--sm-primary)_12%,transparent)]",
  corporate_card: "text-violet-600 bg-violet-50 dark:text-violet-400 dark:bg-violet-900/30",
};

const TYPE_PILL: Record<string, string> = {
  employee: "bg-muted text-muted-foreground",
  client:   "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  project:  "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
};

// ── Main ──────────────────────────────────────────────────────────────────────

function Reports() {
  const { smRole } = useAuth();
  if (smRole === null) return null;

  const today = new Date();
  const [fromDate, setFromDate] = useState(
    format(startOfMonth(subMonths(today, 0)), "yyyy-MM-dd"),
  );
  const [toDate, setToDate] = useState(format(endOfMonth(today), "yyyy-MM-dd"));
  const [methodFilter, setMethodFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const [payments, setPayments] = useState<PaymentLog[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: pData }, { data: aData }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("subscription_payment_logs")
        .select("*, subscriptions(name, vendor, category, currency, license_count)")
        .gte("payment_date", fromDate)
        .lte("payment_date", toDate)
        .order("payment_date", { ascending: false }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("sm_license_assignments")
        .select("*, subscriptions(name, vendor, category)")
        .eq("status", "active")
        .order("assigned_at"),
    ]);
    setPayments((pData as PaymentLog[]) ?? []);
    setAssignments((aData as Assignment[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [fromDate, toDate]);

  // Filtered payments
  const filteredPayments = useMemo(
    () => payments.filter((p) => methodFilter === "all" || p.payment_method === methodFilter),
    [payments, methodFilter],
  );

  // Filtered assignments
  const filteredAssignments = useMemo(
    () => assignments.filter((a) => typeFilter === "all" || a.assignee_type === typeFilter),
    [assignments, typeFilter],
  );

  // KPIs
  const totalCOP = useMemo(
    () => filteredPayments
      .filter((p) => p.payment_method === "petty_cash")
      .reduce((s, p) => s + Number(p.amount), 0),
    [filteredPayments],
  );
  const totalUSD = useMemo(
    () => filteredPayments
      .filter((p) => p.payment_method === "corporate_card")
      .reduce((s, p) => s + Number(p.amount), 0),
    [filteredPayments],
  );

  // ── Export Excel ──────────────────────────────────────────────────────────

  const exportExcel = async () => {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Stack Management";
    wb.created = new Date();

    // Payments sheet
    const ws1 = wb.addWorksheet("Payments");
    ws1.columns = [
      { header: "Date",         key: "date",   width: 14 },
      { header: "Subscription", key: "sub",    width: 30 },
      { header: "Vendor",       key: "vendor", width: 20 },
      { header: "Category",     key: "cat",    width: 16 },
      { header: "Method",       key: "method", width: 16 },
      { header: "Currency",     key: "curr",   width: 10 },
      { header: "Amount",       key: "amount", width: 16 },
      { header: "Reference",    key: "ref",    width: 20 },
      { header: "Notes",        key: "notes",  width: 30 },
    ];
    ws1.getRow(1).font = { bold: true };
    for (const p of filteredPayments) {
      const currency = p.subscriptions?.currency ?? (p.payment_method === "corporate_card" ? "USD" : "COP");
      ws1.addRow({
        date: format(new Date(p.payment_date + "T12:00:00"), "yyyy-MM-dd"),
        sub: p.subscriptions?.name ?? "",
        vendor: p.subscriptions?.vendor ?? "",
        cat: p.subscriptions?.category ?? "",
        method: PM_LABEL[p.payment_method] ?? p.payment_method,
        curr: currency,
        amount: Number(p.amount),
        ref: p.reference ?? "",
        notes: p.notes ?? "",
      });
    }
    // Totals row
    ws1.addRow({});
    const totRow = ws1.addRow({ method: "TOTAL COP (Petty cash)", amount: totalCOP });
    totRow.font = { bold: true };
    const totRow2 = ws1.addRow({ method: "TOTAL USD (Corporate card)", amount: totalUSD });
    totRow2.font = { bold: true };

    // Assignees sheet
    const ws2 = wb.addWorksheet("Assignees");
    ws2.columns = [
      { header: "Type",         key: "type",  width: 12 },
      { header: "Name",         key: "name",  width: 24 },
      { header: "Email",        key: "email", width: 28 },
      { header: "Reference",    key: "ref",   width: 16 },
      { header: "Subscription", key: "sub",   width: 30 },
      { header: "Category",     key: "cat",   width: 16 },
      { header: "Assigned",     key: "date",  width: 14 },
    ];
    ws2.getRow(1).font = { bold: true };
    for (const a of filteredAssignments) {
      ws2.addRow({
        type: a.assignee_type,
        name: a.assigned_name ?? "",
        email: a.assigned_email ?? "",
        ref: a.assignee_ref ?? "",
        sub: a.subscriptions?.name ?? "",
        cat: a.subscriptions?.category ?? "",
        date: format(new Date(a.assigned_at), "yyyy-MM-dd"),
      });
    }

    const label = `${fromDate}_${toDate}`;
    await downloadWorkbook(wb, `sm-report-${label}.xlsx`);
  };

  // ── Export PDF (print) ────────────────────────────────────────────────────

  const exportPDF = () => window.print();

  return (
    <>
      {/* Print-only header */}
      <div className="hidden print:block mb-6">
        <div className="text-xs uppercase tracking-widest text-gray-500">Stack Management Report</div>
        <div className="text-2xl font-bold">Payments · {fromDate} → {toDate}</div>
      </div>

      <div className="space-y-6 print:space-y-4">
        {/* Page header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Stack Management</div>
            <h1 className="font-display text-3xl tracking-tight">Reports</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportPDF} className="gap-2">
              <Printer className="h-4 w-4" /> PDF
            </Button>
            <Button
              onClick={exportExcel}
              style={{ background: "var(--sm-primary)", color: "var(--sm-primary-fg)" }}
              className="gap-2"
            >
              <FileDown className="h-4 w-4" /> Excel
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="p-5 print:hidden">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label>From</Label>
              <DatePicker value={fromDate} onChange={(v) => v && setFromDate(v)} placeholder="From date" />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <DatePicker value={toDate} onChange={(v) => v && setToDate(v)} placeholder="To date" />
            </div>
            <div className="space-y-1.5">
              <Label>Payment method</Label>
              <Select value={methodFilter} onValueChange={setMethodFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="petty_cash">Petty cash</SelectItem>
                  <SelectItem value="corporate_card">Corporate card</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assignee type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            {[
              { label: "This month", from: format(startOfMonth(today), "yyyy-MM-dd"), to: format(endOfMonth(today), "yyyy-MM-dd") },
              { label: "Last month", from: format(startOfMonth(subMonths(today, 1)), "yyyy-MM-dd"), to: format(endOfMonth(subMonths(today, 1)), "yyyy-MM-dd") },
              { label: "Last 3 months", from: format(startOfMonth(subMonths(today, 2)), "yyyy-MM-dd"), to: format(endOfMonth(today), "yyyy-MM-dd") },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => { setFromDate(p.from); setToDate(p.to); }}
                className="rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground transition-colors hover:border-[var(--sm-primary)]/50 hover:text-foreground"
              >
                {p.label}
              </button>
            ))}
          </div>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center p-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Card className="p-4">
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Payments</div>
                <div className="mt-1 font-display text-2xl">{filteredPayments.length}</div>
              </Card>
              <Card className="p-4 border-l-4 border-l-[var(--sm-primary)]">
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Total COP</div>
                <div className="mt-1 font-num text-xl font-bold tabular-nums">{fmtCOP(totalCOP)}</div>
                <div className="font-mono text-[10px] text-muted-foreground">Petty cash</div>
              </Card>
              <Card className="p-4 border-l-4 border-l-violet-500">
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Total USD</div>
                <div className="mt-1 font-num text-xl font-bold tabular-nums">{fmtUSD(totalUSD)}</div>
                <div className="font-mono text-[10px] text-muted-foreground">Corporate card</div>
              </Card>
              <Card className="p-4">
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Assignees</div>
                <div className="mt-1 font-display text-2xl">{filteredAssignments.length}</div>
                <div className="font-mono text-[10px] text-muted-foreground">active licenses</div>
              </Card>
            </div>

            {/* Payment logs */}
            <Card className="overflow-hidden">
              <div className="border-b border-border px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  <BarChart2 className="h-3.5 w-3.5" />
                  Payments ({filteredPayments.length})
                </div>
                <div className="print:hidden text-xs text-muted-foreground">{fromDate} → {toDate}</div>
              </div>
              {filteredPayments.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">No payments in this date range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-5 py-2.5 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Date</th>
                        <th className="px-5 py-2.5 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Subscription</th>
                        <th className="px-5 py-2.5 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Method</th>
                        <th className="px-5 py-2.5 text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Amount</th>
                        <th className="px-5 py-2.5 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground print:hidden">Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredPayments.map((p) => {
                        const currency = p.subscriptions?.currency ?? (p.payment_method === "corporate_card" ? "USD" : "COP");
                        return (
                          <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-5 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(p.payment_date + "T12:00:00"), "MMM d, yyyy")}
                            </td>
                            <td className="px-5 py-3">
                              <div className="font-medium">{p.subscriptions?.name ?? "—"}</div>
                              {p.subscriptions?.category && (
                                <div className="font-mono text-[10px] text-muted-foreground">{p.subscriptions.category}</div>
                              )}
                            </td>
                            <td className="px-5 py-3">
                              <span className={`inline-flex items-center rounded px-2 py-0.5 font-mono text-[10px] font-semibold ${PM_PILL[p.payment_method]}`}>
                                {PM_LABEL[p.payment_method]}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right font-num font-semibold tabular-nums whitespace-nowrap">
                              {fmtAmt(Number(p.amount), currency)}
                            </td>
                            <td className="px-5 py-3 font-mono text-xs text-muted-foreground print:hidden">
                              {p.reference ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/30">
                        <td colSpan={3} className="px-5 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          Total
                        </td>
                        <td className="px-5 py-3 text-right">
                          {totalCOP > 0 && <div className="font-num font-bold tabular-nums">{fmtCOP(totalCOP)}</div>}
                          {totalUSD > 0 && <div className="font-num font-bold tabular-nums">{fmtUSD(totalUSD)}</div>}
                        </td>
                        <td className="print:hidden" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </Card>

            {/* Active assignees */}
            <Card className="overflow-hidden">
              <div className="border-b border-border px-5 py-3 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                <BarChart2 className="h-3.5 w-3.5" />
                Active assignees ({filteredAssignments.length})
              </div>
              {filteredAssignments.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">No active license assignments.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-5 py-2.5 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Type</th>
                        <th className="px-5 py-2.5 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Name</th>
                        <th className="px-5 py-2.5 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Email / Ref</th>
                        <th className="px-5 py-2.5 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Subscription</th>
                        <th className="px-5 py-2.5 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Since</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredAssignments.map((a) => (
                        <tr key={a.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold capitalize ${TYPE_PILL[a.assignee_type] ?? TYPE_PILL.employee}`}>
                              {a.assignee_type}
                            </span>
                          </td>
                          <td className="px-5 py-3 font-medium">{a.assigned_name ?? "—"}</td>
                          <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                            {a.assigned_email ?? a.assignee_ref ?? "—"}
                          </td>
                          <td className="px-5 py-3">
                            <div className="font-medium">{a.subscriptions?.name ?? "—"}</div>
                            {a.subscriptions?.category && (
                              <div className="font-mono text-[10px] text-muted-foreground">{a.subscriptions.category}</div>
                            )}
                          </td>
                          <td className="px-5 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(a.assigned_at), "MMM d, yyyy")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
}
