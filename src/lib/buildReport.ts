import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import logoUrl from "@/assets/staffing-global-logo.jpg";

// SOP v1.0 Brand Palette
const NAVY: [number, number, number] = [34, 50, 109];       // #22326D — main titles
const BLUE: [number, number, number] = [42, 79, 134];       // #2A4F86 — section titles, table headers
const GREEN: [number, number, number] = [119, 195, 69];     // #77C345 — inflows accent
const RED: [number, number, number] = [163, 45, 45];        // #A32D2D — expenses accent
const NEUTRAL: [number, number, number] = [26, 26, 26];     // #1A1A1A — balance values
const CARD_BG: [number, number, number] = [244, 246, 249];  // #F4F6F9
const BORDER: [number, number, number] = [208, 217, 232];   // #D0D9E8
const TOTAL_BG: [number, number, number] = [214, 226, 245]; // #D6E2F5
const ALT_ROW: [number, number, number] = [250, 250, 250];  // #FAFAFA
const FOOTER_GRAY: [number, number, number] = [90, 90, 90];

type DocWithTable = jsPDF & { lastAutoTable: { finalY: number } };
type TableOptions = Parameters<typeof autoTable>[1] & { didAddPage?: () => void };

export type ReportInvoice = {
  id: string;
  invoice_number: string;
  amount: number;
  vendor: string;
  invoice_date: string;
  category: string;
  status: string;
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
    new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);

  const catMap: Record<string, number> = {};
  approved.forEach((i) => {
    catMap[i.category] = (catMap[i.category] ?? 0) + Number(i.amount);
  });
  const catEntries = Object.entries(catMap);

  const logoData = await loadLogoDataUrl();
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 56;
  const contentW = pageW - marginX * 2;

  // ── Page header (drawn on every page) ────────────────────────────────
  const drawPageHeader = () => {
    const logoW = 110, logoH = 48;
    doc.addImage(logoData, "JPEG", pageW - marginX - logoW, 26, logoW, logoH, undefined, "FAST");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...NAVY);
    doc.text("MONTHLY EXPENSE REPORT", marginX, 44);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    doc.text("Prepared by Staffing Global", marginX, 58);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...BLUE);
    doc.text(`Period: ${periodLabel}`, marginX, 72);

    doc.setDrawColor(...GREEN);
    doc.setLineWidth(2);
    doc.line(marginX, 82, pageW - marginX, 82);
  };

  // ── Footer (rendered retroactively after all pages are known) ─────────
  const drawFooter = (pageNum: number, pageCount: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...FOOTER_GRAY);
    doc.text("contacto@staffingglobal.com  |  www.staffingglobal.org", marginX, pageH - 28);
    doc.text(`Page ${pageNum} of ${pageCount}`, pageW - marginX, pageH - 28, { align: "right" });
  };

  // ── Section title with green accent line ─────────────────────────────
  const drawSectionTitle = (y: number, title: string): number => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...BLUE);
    doc.text(title, marginX, y);
    doc.setDrawColor(...GREEN);
    doc.setLineWidth(1.5);
    doc.line(marginX, y + 5, marginX + doc.getTextWidth(title) + 6, y + 5);
    return y + 20;
  };

  // ── Card helper (2×2 Key Findings grid) ─────────────────────────────
  const drawCard = (
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    value: string,
    accent: [number, number, number],
  ) => {
    doc.setFillColor(...CARD_BG);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.5);
    doc.rect(x, y, w, h, "FD");
    doc.setFillColor(...accent);
    doc.rect(x, y, 4, h, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(110, 110, 110);
    doc.text(label.toUpperCase(), x + 14, y + 17);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...accent);
    doc.text(value, x + 14, y + 46);
  };

  // ── Ensure enough vertical space before a section ────────────────────
  let y = 0;
  const ensureSpace = (needed: number) => {
    if (y > pageH - needed) {
      doc.addPage();
      drawPageHeader();
      y = 108;
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // 1. HEADER
  // ─────────────────────────────────────────────────────────────────────
  drawPageHeader();
  y = 102;

  // ─────────────────────────────────────────────────────────────────────
  // 2. KEY FINDINGS (2×2 card grid)
  // ─────────────────────────────────────────────────────────────────────
  y = drawSectionTitle(y, "Key Findings");

  const cardGap = 12;
  const cardW = (contentW - cardGap) / 2;
  const cardH = 66;

  drawCard(marginX, y, cardW, cardH, "Opening Balance", fmt(openingBalance), NEUTRAL);
  drawCard(marginX + cardW + cardGap, y, cardW, cardH, "Total Cash Inflows", fmt(inflowsTotal), GREEN);
  y += cardH + cardGap;
  drawCard(marginX, y, cardW, cardH, "Total Approved Expenses", fmt(expensesTotal), RED);
  drawCard(
    marginX + cardW + cardGap,
    y,
    cardW,
    cardH,
    "Closing Balance",
    fmt(closingBalance),
    closingBalance < 0 ? RED : NEUTRAL,
  );
  y += cardH + 32;

  // ─────────────────────────────────────────────────────────────────────
  // 3. CATEGORIES
  // ─────────────────────────────────────────────────────────────────────
  ensureSpace(160);
  y = drawSectionTitle(y, "Expense Categories");

  autoTable(doc, {
    startY: y,
    head: [["Category", "Amount"]],
    body:
      catEntries.length > 0
        ? [
            ...catEntries.map(([c, v]) => [c.replace(/_/g, " "), fmt(v)]),
            [
              { content: "Total", styles: { fontStyle: "bold" } },
              { content: fmt(expensesTotal), styles: { fontStyle: "bold" } },
            ],
          ]
        : [
            [
              {
                content: "No records found for this period",
                colSpan: 2,
                styles: { fontStyle: "italic", textColor: [150, 150, 150] as [number, number, number], halign: "center" as const },
              },
            ],
          ],
    headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 10 },
    styles: { fontSize: 9, cellPadding: 5 },
    columnStyles: { 1: { halign: "right" } },
    alternateRowStyles: { fillColor: ALT_ROW },
    margin: { top: 100, bottom: 50, left: marginX, right: marginX },
    didParseCell: (hookData) => {
      if (
        catEntries.length > 0 &&
        hookData.section === "body" &&
        hookData.row.index === catEntries.length
      ) {
        hookData.cell.styles.fillColor = TOTAL_BG;
        hookData.cell.styles.fontStyle = "bold";
      }
    },
    didAddPage: () => drawPageHeader(),
  } as TableOptions);

  y = (doc as DocWithTable).lastAutoTable.finalY + 32;

  // ─────────────────────────────────────────────────────────────────────
  // 4. APPROVED INVOICES
  // ─────────────────────────────────────────────────────────────────────
  ensureSpace(160);
  y = drawSectionTitle(y, "Approved Invoices");

  autoTable(doc, {
    startY: y,
    head: [["Invoice #", "Date", "Vendor", "Category", "Amount"]],
    body:
      approved.length > 0
        ? [
            ...approved.map((i) => [
              i.invoice_number,
              i.invoice_date,
              i.vendor,
              i.category.replace(/_/g, " "),
              fmt(Number(i.amount)),
            ]),
            [
              { content: "Total", colSpan: 4, styles: { fontStyle: "bold" } },
              { content: fmt(expensesTotal), styles: { fontStyle: "bold" } },
            ],
          ]
        : [
            [
              {
                content: "No records found for this period",
                colSpan: 5,
                styles: { fontStyle: "italic", textColor: [150, 150, 150] as [number, number, number], halign: "center" as const },
              },
            ],
          ],
    headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 10 },
    styles: { fontSize: 9, cellPadding: 5 },
    columnStyles: { 4: { halign: "right" } },
    alternateRowStyles: { fillColor: ALT_ROW },
    margin: { top: 100, bottom: 50, left: marginX, right: marginX },
    didParseCell: (hookData) => {
      if (
        approved.length > 0 &&
        hookData.section === "body" &&
        hookData.row.index === approved.length
      ) {
        hookData.cell.styles.fillColor = TOTAL_BG;
        hookData.cell.styles.fontStyle = "bold";
      }
    },
    didAddPage: () => drawPageHeader(),
  } as TableOptions);

  y = (doc as DocWithTable).lastAutoTable.finalY + 32;

  // ─────────────────────────────────────────────────────────────────────
  // 5. CASH INFLOWS
  // ─────────────────────────────────────────────────────────────────────
  ensureSpace(160);
  y = drawSectionTitle(y, "Cash Inflows");

  autoTable(doc, {
    startY: y,
    head: [["Date", "Type", "Description", "Amount"]],
    body:
      inflowsFiltered.length > 0
        ? [
            ...inflowsFiltered.map((i) => [
              i.created_at.slice(0, 10),
              i.type,
              i.description ?? "",
              fmt(Number(i.amount)),
            ]),
            [
              { content: "Total", colSpan: 3, styles: { fontStyle: "bold" } },
              { content: fmt(inflowsTotal), styles: { fontStyle: "bold" } },
            ],
          ]
        : [
            [
              {
                content: "No records found for this period",
                colSpan: 4,
                styles: { fontStyle: "italic", textColor: [150, 150, 150] as [number, number, number], halign: "center" as const },
              },
            ],
          ],
    headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 10 },
    styles: { fontSize: 9, cellPadding: 5 },
    columnStyles: { 3: { halign: "right" } },
    alternateRowStyles: { fillColor: ALT_ROW },
    margin: { top: 100, bottom: 50, left: marginX, right: marginX },
    didParseCell: (hookData) => {
      if (
        inflowsFiltered.length > 0 &&
        hookData.section === "body" &&
        hookData.row.index === inflowsFiltered.length
      ) {
        hookData.cell.styles.fillColor = TOTAL_BG;
        hookData.cell.styles.fontStyle = "bold";
      }
    },
    didAddPage: () => drawPageHeader(),
  } as TableOptions);

  y = (doc as DocWithTable).lastAutoTable.finalY + 32;

  // ─────────────────────────────────────────────────────────────────────
  // 6. CONCLUSION
  // ─────────────────────────────────────────────────────────────────────
  ensureSpace(120);
  y = drawSectionTitle(y, "Conclusion");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text(
    "The information presented in this report is intended to support internal evaluation,\ntracking, and operational review processes.",
    marginX,
    y,
  );

  // ─────────────────────────────────────────────────────────────────────
  // 7. FOOTERS (all pages)
  // ─────────────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    drawFooter(p, pageCount);
  }

  return doc;
}

export async function fetchAndBuildReport(params: {
  from: string;
  to: string;
  category: string;
  status: string;
  periodLabel: string;
}): Promise<{ doc: jsPDF; filename: string }> {
  const [{ data: cs }, { data: pcb }, invResult] = await Promise.all([
    supabase.from("cash_settings").select("opening_balance,currency").eq("id", true).maybeSingle(),
    supabase.from("petty_cash_balance").select("amount,type,description,created_at"),
    (() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase.from("invoices").select("*") as any)
        .gte("invoice_date", params.from)
        .lte("invoice_date", params.to);
      if (params.category && params.category !== "all") q = q.eq("category", params.category);
      if (params.status && params.status !== "all") q = q.eq("status", params.status);
      return q.order("invoice_date", { ascending: false });
    })(),
  ]);

  const periodLabel = format(parseISO(params.from), "MMMM yyyy");

  const doc = await buildReport({
    invoices: (invResult.data as ReportInvoice[]) ?? [],
    periodLabel,
    openingBalance: Number(cs?.opening_balance ?? 0),
    currency: cs?.currency ?? "COP",
    inflows:
      (pcb as { amount: number; type: string; description: string | null; created_at: string }[]) ??
      [],
  });

  return { doc, filename: `petty-cash-report-${params.from}-to-${params.to}.pdf` };
}
