import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDown, FileSpreadsheet, FileText } from "lucide-react";
import { format, startOfMonth } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { logAction } from "@/lib/audit";
import { StatusBadge } from "./index";

export const Route = createFileRoute("/reports")({
  component: () => <AppShell><Reports /></AppShell>,
});

type Inv = { id: string; invoice_number: string; amount: number; vendor: string; invoice_date: string; category: string; status: string; };

function Reports() {
  const [items, setItems] = useState<Inv[]>([]);
  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");

  useEffect(() => {
    supabase.from("invoices").select("*").order("invoice_date", { ascending: false })
      .then(({ data }) => setItems((data as Inv[]) ?? []));
  }, []);

  const filtered = useMemo(() => items.filter((i) => {
    const d = i.invoice_date;
    return d >= from && d <= to &&
      (category === "all" || i.category === category) &&
      (status === "all" || i.status === status);
  }), [items, from, to, category, status]);

  const totals = useMemo(() => {
    const total = filtered.reduce((s, i) => s + Number(i.amount), 0);
    const approved = filtered.filter(i => i.status === "approved").reduce((s, i) => s + Number(i.amount), 0);
    return { total, approved, count: filtered.length };
  }, [filtered]);

  const exportPDF = async () => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("SuplySync — Petty Cash Report", 14, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Period: ${from} to ${to}`, 14, 26);
    doc.text(`Generated: ${format(new Date(), "PPpp")}`, 14, 31);
    doc.text(`Total invoices: ${totals.count}  ·  Total: $${totals.total.toFixed(2)}  ·  Approved: $${totals.approved.toFixed(2)}`, 14, 36);

    autoTable(doc, {
      startY: 42,
      head: [["Invoice #", "Date", "Vendor", "Category", "Status", "Amount"]],
      body: filtered.map(i => [
        i.invoice_number, format(new Date(i.invoice_date), "yyyy-MM-dd"),
        i.vendor, i.category.replace(/_/g, " "), i.status, `$${Number(i.amount).toFixed(2)}`,
      ]),
      headStyles: { fillColor: [15, 23, 42] },
      styles: { fontSize: 9 },
    });
    doc.save(`suplysync-report-${from}-to-${to}.pdf`);
    await logAction({ action: "report.export.pdf", metadata: { from, to, count: totals.count } });
    toast.success("PDF exported");
  };

  const exportXLSX = async () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(i => ({
      "Invoice #": i.invoice_number,
      Date: i.invoice_date,
      Vendor: i.vendor,
      Category: i.category.replace(/_/g, " "),
      Status: i.status,
      Amount: Number(i.amount),
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Invoices");
    XLSX.writeFile(wb, `suplysync-report-${from}-to-${to}.xlsx`);
    await logAction({ action: "report.export.xlsx", metadata: { from, to, count: totals.count } });
    toast.success("Excel exported");
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Reporting</div>
        <h1 className="font-display text-3xl tracking-tight">Reports</h1>
      </div>

      <Card className="p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {["office_supplies", "travel", "meals", "transport", "utilities", "maintenance", "marketing", "other"].map(c => (
                  <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="under_review">Under review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Records</div>
          <div className="mt-2 font-display text-3xl">{totals.count}</div>
        </Card>
        <Card className="p-5">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Total amount</div>
          <div className="mt-2 font-display text-3xl">${totals.total.toFixed(2)}</div>
        </Card>
        <Card className="p-5 bg-gradient-tertiary text-tertiary-foreground">
          <div className="font-mono text-[10px] uppercase tracking-widest opacity-80">Approved total</div>
          <div className="mt-2 font-display text-3xl">${totals.approved.toFixed(2)}</div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={exportPDF} className="bg-gradient-primary text-primary-foreground">
          <FileDown className="mr-1.5 h-4 w-4" /> Export PDF
        </Button>
        <Button onClick={exportXLSX} variant="outline">
          <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Export Excel
        </Button>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">No records in selected range.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(i => (
                  <tr key={i.id}>
                    <td className="px-4 py-3 font-mono text-xs">{i.invoice_number}</td>
                    <td className="px-4 py-3">{format(new Date(i.invoice_date), "MMM d, yyyy")}</td>
                    <td className="px-4 py-3 font-medium">{i.vendor}</td>
                    <td className="px-4 py-3 text-muted-foreground">{i.category.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3"><StatusBadge status={i.status} /></td>
                    <td className="px-4 py-3 text-right font-num font-semibold">${Number(i.amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
