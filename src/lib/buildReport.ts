import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import logoUrl from "@/assets/staffing-global-logo.jpg";

const BRAND_BLUE: [number, number, number] = [27, 47, 138];
const BRAND_GREEN: [number, number, number] = [122, 193, 67];
const FOOTER_GRAY: [number, number, number] = [90, 90, 90];
const WATERMARK_GRAY: [number, number, number] = [228, 232, 237];

type DocWithTable = jsPDF & { lastAutoTable: { finalY: number } };
type TableOptions = Parameters<typeof autoTable>[1] & { didAddPage?: () => void };

export type ReportInvoice = {
  id: string; invoice_number: string; amount: number; vendor: string;
  invoice_date: string; category: string; status: string;
};

export type ReportData = {
  invoices: ReportInvoice[];
  periodLabel: string;
  openingBalance: number;
  currency: string;
  inflows: { amount: number; type: string; description: string | null; created_at: string }[];
};

async function loadLogoDataUrl(): Promise<string> {
  const res = await fetch(logoUrl);
  const blob = await res.blob();
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.readAsDataURL(blob);
  });
}

export async function buildReport(data: ReportData): Promise<jsPDF> {
  const { invoices, periodLabel, openingBalance, currency, inflows } = data;
  const approved = invoices.filter((i) => i.status === "approved");
  const inflowsFiltered = inflows.filter((p) => p.type === "inflow");
  const inflowsTotal = inflowsFiltered.reduce((s, p) => s + Number(p.amount), 0);
  const expensesTotal = approved.reduce((s, i) => s + Number(i.amount), 0);
  const closingBalance = openingBalance + inflowsTotal - expensesTotal;

  const fmt = (n: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

  const catMap: Record<string, number> = {};
  approved.forEach((i) => { catMap[i.category] = (catMap[i.category] ?? 0) + Number(i.amount); });

  const logoData = await loadLogoDataUrl();
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 56;

  const drawHeader = () => {
    doc.addImage(logoData, "JPEG", marginX, 30, 110, 50, undefined, "FAST");
    doc.setDrawColor(...BRAND_BLUE); doc.setLineWidth(2);
    doc.line(marginX, 88, marginX + 170, 88);
    const barY = 70, barH = 14, barStart = marginX + 180, barEnd = pageW - marginX;
    const barMid = barStart + (barEnd - barStart) * 0.28;
    doc.setFillColor(...BRAND_BLUE); doc.rect(barStart, barY, barMid - barStart, barH, "F");
    doc.setFillColor(...BRAND_GREEN); doc.rect(barMid, barY, barEnd - barMid, barH, "F");
  };

  const drawWatermark = () => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(54);
    doc.setTextColor(...WATERMARK_GRAY);
    doc.text("STAFFING GLOBAL", pageW / 2, pageH / 2, { align: "center" });
  };

  const drawFooter = (pageNum: number, pageCount: number) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...FOOTER_GRAY);
    doc.text("Staffing Global  |  contacto@staffingglobal.com  |  www.staffingglobal.org", pageW / 2, pageH - 36, { align: "center" });
    doc.setFontSize(7.5);
    doc.text(`Generated ${format(new Date(), "PPpp")}`, marginX, pageH - 22);
    doc.text(`Page ${pageNum} of ${pageCount}`, pageW - marginX, pageH - 22, { align: "right" });
  };

  const onNewPage = () => { drawHeader(); drawWatermark(); };

  drawHeader();
  drawWatermark();

  doc.setTextColor(...BRAND_BLUE); doc.setFont("helvetica", "bold"); doc.setFontSize(20);
  doc.text("MONTHLY EXPENSE ANALYSIS REPORT", marginX, 130);
  doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.setTextColor(80, 80, 80);
  doc.text("Prepared by Staffing Global", marginX, 148);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(`Period: ${periodLabel}`, marginX, 164);

  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...BRAND_BLUE);
  doc.text("Executive Summary", marginX, 196);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(60, 60, 60);
  doc.text("This report summarizes the petty cash activity for the selected period, including\nopening balance, cash inflows, approved expenses and the resulting closing balance.", marginX, 214);

  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...BRAND_BLUE);
  doc.text("Key Findings", marginX, 254);

  autoTable(doc, {
    startY: 262, theme: "plain",
    styles: { fontSize: 10, cellPadding: 6 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 220 }, 1: { halign: "right" } },
    body: [
      ["Records analyzed", String(invoices.length)],
      ["Opening balance", fmt(openingBalance)],
      ["Total cash inflows", fmt(inflowsTotal)],
      ["Total approved expenses", fmt(expensesTotal)],
      [{ content: "Closing balance", styles: { fontStyle: "bold" } },
       { content: fmt(closingBalance), styles: { fontStyle: "bold", textColor: closingBalance < 0 ? [200, 30, 30] : BRAND_BLUE } }],
    ],
    didAddPage: onNewPage,
  } as TableOptions);

  let y = (doc as DocWithTable).lastAutoTable.finalY + 22;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...BRAND_BLUE);
  doc.text("Categories breakdown (approved)", marginX, y);
  autoTable(doc, {
    startY: y + 8, head: [["Category", "Amount"]],
    body: Object.entries(catMap).map(([c, v]) => [c.replace(/_/g, " "), fmt(v)]),
    headStyles: { fillColor: BRAND_BLUE, textColor: 255 },
    styles: { fontSize: 9, cellPadding: 5 }, columnStyles: { 1: { halign: "right" } },
    didAddPage: onNewPage,
  } as TableOptions);

  y = (doc as DocWithTable).lastAutoTable.finalY + 22;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...BRAND_BLUE);
  doc.text("Approved invoices", marginX, y);
  autoTable(doc, {
    startY: y + 8, head: [["Invoice #", "Date", "Vendor", "Category", "Amount"]],
    body: approved.map((i) => [i.invoice_number, format(new Date(i.invoice_date + "T12:00:00"), "yyyy-MM-dd"), i.vendor, i.category.replace(/_/g, " "), fmt(Number(i.amount))]),
    headStyles: { fillColor: BRAND_BLUE, textColor: 255 },
    styles: { fontSize: 9, cellPadding: 5 }, columnStyles: { 4: { halign: "right" } },
    didAddPage: onNewPage,
  } as TableOptions);

  y = (doc as DocWithTable).lastAutoTable.finalY + 22;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...BRAND_BLUE);
  doc.text("Cash inflows", marginX, y);
  autoTable(doc, {
    startY: y + 8, head: [["Date", "Type", "Description", "Amount"]],
    body: inflowsFiltered.map((i) => [i.created_at.slice(0, 10), i.type, i.description ?? "", fmt(Number(i.amount))]),
    headStyles: { fillColor: BRAND_BLUE, textColor: 255 },
    styles: { fontSize: 9, cellPadding: 5 }, columnStyles: { 3: { halign: "right" } },
    didAddPage: onNewPage,
  } as TableOptions);

  y = (doc as DocWithTable).lastAutoTable.finalY + 24;
  if (y > pageH - 120) { doc.addPage(); drawHeader(); drawWatermark(); y = 130; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...BRAND_BLUE);
  doc.text("Conclusion", marginX, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(60, 60, 60);
  doc.text("The information presented in this report is intended to support internal evaluation,\ntracking, and operational review processes.", marginX, y + 18);

  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) { doc.setPage(p); drawFooter(p, pageCount); }

  return doc;
}

export async function fetchAndBuildReport(params: {
  from: string; to: string; category: string; status: string; periodLabel: string;
}): Promise<{ doc: jsPDF; filename: string }> {
  const [{ data: cs }, { data: pcb }, invResult] = await Promise.all([
    supabase.from("cash_settings").select("opening_balance,currency").eq("id", true).maybeSingle(),
    supabase.from("petty_cash_balance").select("amount,type,description,created_at"),
    (() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase.from("invoices").select("*") as any).gte("invoice_date", params.from).lte("invoice_date", params.to);
      if (params.category && params.category !== "all") q = q.eq("category", params.category);
      if (params.status && params.status !== "all") q = q.eq("status", params.status);
      return q.order("invoice_date", { ascending: false });
    })(),
  ]);

  const doc = await buildReport({
    invoices: (invResult.data as ReportInvoice[]) ?? [],
    periodLabel: params.periodLabel,
    openingBalance: Number(cs?.opening_balance ?? 0),
    currency: cs?.currency ?? "COP",
    inflows: (pcb as { amount: number; type: string; description: string | null; created_at: string }[]) ?? [],
  });

  return { doc, filename: `petty-cash-report-${params.from}-to-${params.to}.pdf` };
}
