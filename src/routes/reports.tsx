import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDown, FileSpreadsheet, FileText, Mail } from "lucide-react";
import { format, startOfMonth } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { logAction } from "@/lib/audit";
import { StatusBadge } from "./index";
import logoUrl from "@/assets/staffing-global-logo.jpg";

// Brand colors from Plantilla_Staffing_Global_OK.docx
const BRAND_BLUE: [number, number, number] = [27, 47, 138];   // dark blue bar
const BRAND_GREEN: [number, number, number] = [122, 193, 67]; // green bar
const FOOTER_GRAY: [number, number, number] = [90, 90, 90];
const WATERMARK_GRAY: [number, number, number] = [210, 215, 220];

async function loadLogoDataUrl(): Promise<string> {
  const res = await fetch(logoUrl);
  const blob = await res.blob();
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.readAsDataURL(blob);
  });
}

const EMAIL_BODY = (recipient: string, periodLabel: string) =>
`Dear ${recipient || "[USER]"},

I hope this email finds you well.

Please find attached the latest financial report (${periodLabel}). This document includes a comprehensive overview of the recent data, expense breakdowns, and overall financial status for your review.

If you have any questions or need further clarification regarding any of the information detailed in the report, please do not hesitate to reach out.

Best regards,

Mariangela Grinzato
Office Manager
. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .


Calle 7 #42-145, Medellín 050021
Mariangela.grinzato@staffingglobal.org`;

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

  const periodLabel = `${format(new Date(from), "MMM d, yyyy")} – ${format(new Date(to), "MMM d, yyyy")}`;

  const buildPDF = async () => {
    // Fetch supporting data for branded report
    const [{ data: cs }, { data: pcb }] = await Promise.all([
      supabase.from("cash_settings").select("opening_balance,currency").eq("id", true).maybeSingle(),
      supabase.from("petty_cash_balance").select("amount,type,description,created_at"),
    ]);
    const opening = Number(cs?.opening_balance ?? 0);
    const currency = cs?.currency ?? "COP";
    const inflows = ((pcb as { amount: number; type: string; description: string | null; created_at: string }[]) ?? [])
      .filter(p => p.type === "inflow");
    const inflowsTotal = inflows.reduce((s, p) => s + Number(p.amount), 0);
    const approved = filtered.filter(i => i.status === "approved");
    const expensesTotal = approved.reduce((s, i) => s + Number(i.amount), 0);
    const closingBalance = opening + inflowsTotal - expensesTotal;

    const fmt = (n: number) =>
      new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

    const catMap: Record<string, number> = {};
    approved.forEach(i => { catMap[i.category] = (catMap[i.category] ?? 0) + Number(i.amount); });

    const logoData = await loadLogoDataUrl();

    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 56;

    // Letterhead — matches Plantilla_Staffing_Global_OK.docx exactly:
    // Logo top-left, then a thin dark blue underline + a dark-blue / green color bar.
    const drawHeader = () => {
      // Logo
      doc.addImage(logoData, "JPEG", marginX, 30, 110, 50, undefined, "FAST");
      // Thin underline beneath logo
      doc.setDrawColor(...BRAND_BLUE);
      doc.setLineWidth(2);
      doc.line(marginX, 88, marginX + 170, 88);
      // Two-tone bar to the right of the logo
      const barY = 70, barH = 14;
      const barStart = marginX + 180;
      const barEnd = pageW - marginX;
      const barMid = barStart + (barEnd - barStart) * 0.28;
      doc.setFillColor(...BRAND_BLUE);
      doc.rect(barStart, barY, barMid - barStart, barH, "F");
      doc.setFillColor(...BRAND_GREEN);
      doc.rect(barMid, barY, barEnd - barMid, barH, "F");
    };

    const drawWatermark = () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(54);
      doc.setTextColor(...WATERMARK_GRAY);
      doc.text("STAFFING GLOBAL", pageW / 2, pageH / 2, { align: "center" });
    };

    const drawFooter = (pageNum: number, pageCount: number) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...FOOTER_GRAY);
      doc.text(
        "Staffing Global  |  contacto@staffingglobal.com  |  www.staffingglobal.org",
        pageW / 2, pageH - 36, { align: "center" }
      );
      doc.setFontSize(7.5);
      doc.text(`Generated ${format(new Date(), "PPpp")}`, marginX, pageH - 22);
      doc.text(`Page ${pageNum} of ${pageCount}`, pageW - marginX, pageH - 22, { align: "right" });
    };

    drawHeader();

    // Title block
    doc.setTextColor(...BRAND_BLUE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("MONTHLY EXPENSE ANALYSIS REPORT", marginX, 130);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text("Prepared by Staffing Global", marginX, 148);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Period: ${periodLabel}`, marginX, 164);

    // Executive Summary
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BRAND_BLUE);
    doc.text("Executive Summary", marginX, 196);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text(
      "This report summarizes the petty cash activity for the selected period, including\nopening balance, cash inflows, approved expenses and the resulting closing balance.",
      marginX, 214
    );

    // Key Findings / Summary table
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BRAND_BLUE);
    doc.text("Key Findings", marginX, 254);

    autoTable(doc, {
      startY: 262,
      theme: "plain",
      styles: { fontSize: 10, cellPadding: 6 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 220 }, 1: { halign: "right" } },
      body: [
        ["Records analyzed", String(totals.count)],
        ["Opening balance", fmt(opening)],
        ["Total cash inflows", fmt(inflowsTotal)],
        ["Total approved expenses", fmt(expensesTotal)],
        [{ content: "Closing balance", styles: { fontStyle: "bold" } },
         { content: fmt(closingBalance), styles: { fontStyle: "bold", textColor: closingBalance < 0 ? [200, 30, 30] : BRAND_BLUE } }],
      ],
    });

    // Categories breakdown
    let y = (doc as any).lastAutoTable.finalY + 22;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BRAND_BLUE);
    doc.text("Categories breakdown (approved)", marginX, y);
    autoTable(doc, {
      startY: y + 8,
      head: [["Category", "Amount"]],
      body: Object.entries(catMap).map(([c, v]) => [c.replace(/_/g, " "), fmt(v)]),
      headStyles: { fillColor: BRAND_BLUE, textColor: 255 },
      styles: { fontSize: 9, cellPadding: 5 },
      columnStyles: { 1: { halign: "right" } },
    });

    // Approved invoices
    y = (doc as any).lastAutoTable.finalY + 22;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BRAND_BLUE);
    doc.text("Approved invoices", marginX, y);
    autoTable(doc, {
      startY: y + 8,
      head: [["Invoice #", "Date", "Vendor", "Category", "Amount"]],
      body: approved.map(i => [
        i.invoice_number, format(new Date(i.invoice_date), "yyyy-MM-dd"),
        i.vendor, i.category.replace(/_/g, " "), fmt(Number(i.amount)),
      ]),
      headStyles: { fillColor: BRAND_BLUE, textColor: 255 },
      styles: { fontSize: 9, cellPadding: 5 },
      columnStyles: { 4: { halign: "right" } },
    });

    // Cash inflows
    y = (doc as any).lastAutoTable.finalY + 22;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BRAND_BLUE);
    doc.text("Cash inflows", marginX, y);
    autoTable(doc, {
      startY: y + 8,
      head: [["Date", "Type", "Description", "Amount"]],
      body: inflows.map(i => [
        i.created_at.slice(0, 10), i.type, i.description ?? "", fmt(Number(i.amount)),
      ]),
      headStyles: { fillColor: BRAND_BLUE, textColor: 255 },
      styles: { fontSize: 9, cellPadding: 5 },
      columnStyles: { 3: { halign: "right" } },
    });

    // Conclusion
    y = (doc as any).lastAutoTable.finalY + 24;
    if (y > pageH - 120) { doc.addPage(); y = 130; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BRAND_BLUE);
    doc.text("Conclusion", marginX, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text(
      "The information presented in this report is intended to support internal evaluation,\ntracking, and operational review processes.",
      marginX, y + 18
    );

    // Decorate every page (header, watermark, footer)
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      if (p > 1) drawHeader();
      drawWatermark();
      drawFooter(p, pageCount);
    }

    return doc;
  };

  const exportPDF = async () => {
    const doc = await buildPDF();
    doc.save(`petty-cash-report-${from}-to-${to}.pdf`);
    await logAction({ action: "report.export.pdf", metadata: { from, to, count: totals.count } });
    toast.success("PDF exported");
  };

  const emailReport = async () => {
    const recipient = window.prompt("Recipient name (used in greeting):", "") ?? "";
    const toEmail = window.prompt("Send to email address:", "") ?? "";
    const doc = await buildPDF();
    doc.save(`petty-cash-report-${from}-to-${to}.pdf`);
    const subject = `Staffing Global – Financial Report (${periodLabel})`;
    const body = EMAIL_BODY(recipient, periodLabel);
    const mailto = `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    await logAction({ action: "report.email.opened", metadata: { from, to, recipient, toEmail } });
    toast.success("Report downloaded — attach it in the email window that just opened");
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
    XLSX.writeFile(wb, `petty-cash-report-${from}-to-${to}.xlsx`);
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
