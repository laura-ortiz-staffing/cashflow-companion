import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, FileDown, FileUp, AlertTriangle, CheckCircle2, Cloud, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { logAction } from "@/lib/audit";

export const Route = createFileRoute("/sync")({
  component: () => <AppShell><Sync /></AppShell>,
});

type Inv = {
  id: string; invoice_number: string; amount: number; vendor: string;
  invoice_date: string; category: string; status: string; notes?: string | null;
};
type Inflow = { id: string; amount: number; description: string | null; created_at: string; type: string };
type Req = { id: string; title: string; amount: number; currency: string; category: string; status: string; description: string | null; created_at: string };

const CATEGORIES = ["office_supplies", "travel", "meals", "transport", "utilities", "maintenance", "marketing", "other"];

function Sync() {
  const { user, role } = useAuth();
  const canImport = role === "super_admin" || role === "admin_uploader";

  const [invoices, setInvoices] = useState<Inv[]>([]);
  const [inflows, setInflows] = useState<Inflow[]>([]);
  const [requests, setRequests] = useState<Req[]>([]);

  // Import preview state
  const [preview, setPreview] = useState<{
    rows: Array<Record<string, unknown>>;
    valid: number;
    duplicates: number;
    invalid: number;
    duplicateNumbers: string[];
    invalidReasons: Record<number, string>;
    inflowRows: Array<Record<string, unknown>>;
    requestRows: Array<Record<string, unknown>>;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      const [inv, infl, req] = await Promise.all([
        supabase.from("invoices").select("*").order("invoice_date", { ascending: false }),
        supabase.from("petty_cash_balance").select("*").order("created_at", { ascending: false }),
        supabase.from("requests").select("*").order("created_at", { ascending: false }),
      ]);
      setInvoices((inv.data as Inv[]) ?? []);
      setInflows((infl.data as Inflow[]) ?? []);
      setRequests((req.data as Req[]) ?? []);
    };
    load();
  }, []);

  const downloadXLSX = async (kind: "invoices" | "inflows" | "requests" | "all") => {
    const wb = XLSX.utils.book_new();

    if (kind === "invoices" || kind === "all") {
      const ws = XLSX.utils.json_to_sheet(invoices.map(i => ({
        "Invoice Number": i.invoice_number,
        "Vendor": i.vendor,
        "Date": i.invoice_date,
        "Amount": Number(i.amount),
        "Category": i.category,
        "Status": i.status,
        "Notes": i.notes ?? "",
      })));
      XLSX.utils.book_append_sheet(wb, ws, "Invoices");
    }
    if (kind === "inflows" || kind === "all") {
      const ws = XLSX.utils.json_to_sheet(inflows.map(i => ({
        "Date": i.created_at.slice(0, 10),
        "Type": i.type,
        "Amount": Number(i.amount),
        "Description": i.description ?? "",
      })));
      XLSX.utils.book_append_sheet(wb, ws, "Cash Inflows");
    }
    if (kind === "requests" || kind === "all") {
      const ws = XLSX.utils.json_to_sheet(requests.map(r => ({
        "Title": r.title,
        "Amount": Number(r.amount),
        "Currency": r.currency,
        "Category": r.category,
        "Status": r.status,
        "Description": r.description ?? "",
        "Date": r.created_at.slice(0, 10),
      })));
      XLSX.utils.book_append_sheet(wb, ws, "Requests");
    }

    const filename = `petty-cash-${kind}-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
    XLSX.writeFile(wb, filename);
    await logAction({ action: `excel.export.${kind}`, metadata: { filename, count: { invoices: invoices.length, inflows: inflows.length, requests: requests.length } } });
    toast.success("Excel exported");
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([{
      "Invoice Number": "INV-20260101-000001",
      "Vendor": "Sample Vendor",
      "Date": "2026-01-01",
      "Amount": 50000,
      "Category": "office_supplies",
      "Status": "submitted",
      "Notes": "",
    }]);
    XLSX.utils.book_append_sheet(wb, ws, "Invoices");
    XLSX.writeFile(wb, "petty-cash-import-template.xlsx");
  };

  const handleFile = async (f: File) => {
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf);

    const invSheet = wb.Sheets["Invoices"];
    const inflowSheet = wb.Sheets["Cash Inflows"] ?? wb.Sheets["Inflows"];
    const reqSheet = wb.Sheets["Requests"];
    const sheet = invSheet ?? wb.Sheets[wb.SheetNames[0]];
    const rows = sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }) : [];

    const existingNumbers = new Set(invoices.map(i => i.invoice_number.trim().toLowerCase()));
    const seenInFile = new Set<string>();
    const duplicateNumbers: string[] = [];
    const invalidReasons: Record<number, string> = {};
    let valid = 0;
    let duplicates = 0;
    let invalid = 0;

    rows.forEach((r, idx) => {
      const num = String(r["Invoice Number"] ?? "").trim();
      const vendor = String(r["Vendor"] ?? "").trim();
      const dateRaw = r["Date"];
      const amt = Number(r["Amount"]);
      const cat = String(r["Category"] ?? "other").trim();

      if (!num) { invalid++; invalidReasons[idx] = "Missing Invoice Number"; return; }
      if (!vendor) { invalid++; invalidReasons[idx] = "Missing Vendor"; return; }
      if (!dateRaw) { invalid++; invalidReasons[idx] = "Missing Date"; return; }
      if (!amt || amt <= 0) { invalid++; invalidReasons[idx] = "Invalid Amount"; return; }
      if (!CATEGORIES.includes(cat)) { invalid++; invalidReasons[idx] = `Unknown Category: ${cat}`; return; }

      const key = num.toLowerCase();
      if (existingNumbers.has(key) || seenInFile.has(key)) {
        duplicates++; duplicateNumbers.push(num); return;
      }
      seenInFile.add(key);
      valid++;
    });

    const inflowRows = inflowSheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(inflowSheet, { defval: "" }) : [];
    const requestRows = reqSheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(reqSheet, { defval: "" }) : [];

    setPreview({
      rows, valid, duplicates, invalid, duplicateNumbers, invalidReasons,
      inflowRows, requestRows,
    });
  };

  const confirmImport = async () => {
    if (!preview || !user) return;
    setImporting(true);
    const existingNumbers = new Set(invoices.map(i => i.invoice_number.trim().toLowerCase()));
    const seen = new Set<string>();
    const toInsert: any[] = [];

    preview.rows.forEach((r) => {
      const num = String(r["Invoice Number"] ?? "").trim();
      if (!num) return;
      const key = num.toLowerCase();
      if (existingNumbers.has(key) || seen.has(key)) return;

      const vendor = String(r["Vendor"] ?? "").trim();
      const amt = Number(r["Amount"]);
      const cat = String(r["Category"] ?? "other").trim();
      const dateRaw = r["Date"];
      const status = String(r["Status"] ?? "submitted").trim();
      const notes = String(r["Notes"] ?? "").trim();

      if (!vendor || !amt || amt <= 0 || !CATEGORIES.includes(cat) || !dateRaw) return;

      let dateStr: string;
      if (typeof dateRaw === "number") {
        const d = XLSX.SSF.parse_date_code(dateRaw);
        dateStr = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
      } else {
        dateStr = String(dateRaw).slice(0, 10);
      }

      seen.add(key);
      toInsert.push({
        invoice_number: num,
        vendor,
        amount: amt,
        invoice_date: dateStr,
        category: cat,
        status: ["submitted", "under_review", "approved", "rejected"].includes(status) ? status : "submitted",
        notes: notes || null,
        uploaded_by: user.id,
        invoice_number_source: "manual",
      });
    });

    // Inflows
    const inflowsToInsert: any[] = [];
    preview.inflowRows.forEach((r) => {
      const amt = Number(r["Amount"]);
      const type = String(r["Type"] ?? "inflow").trim();
      const desc = String(r["Description"] ?? "").trim();
      if (!amt || amt <= 0) return;
      inflowsToInsert.push({
        amount: amt,
        type: ["inflow", "adjustment"].includes(type) ? type : "inflow",
        description: desc || null,
        created_by: user.id,
      });
    });

    // Requests
    const requestsToInsert: any[] = [];
    preview.requestRows.forEach((r) => {
      const amt = Number(r["Amount"]);
      const title = String(r["Title"] ?? "").trim();
      const cat = String(r["Category"] ?? "other").trim();
      if (!title || !amt || amt <= 0) return;
      requestsToInsert.push({
        title,
        amount: amt,
        currency: String(r["Currency"] ?? "COP").trim() || "COP",
        category: CATEGORIES.includes(cat) ? cat : "other",
        status: "pending",
        description: String(r["Description"] ?? "").trim() || null,
        requested_by: user.id,
      });
    });

    if (toInsert.length === 0 && inflowsToInsert.length === 0 && requestsToInsert.length === 0) {
      toast.error("Nothing to import");
      setImporting(false);
      return;
    }

    let invErr = null, infErr = null, reqErr = null;
    if (toInsert.length) {
      const { error } = await supabase.from("invoices").insert(toInsert);
      invErr = error;
    }
    if (inflowsToInsert.length) {
      const { error } = await supabase.from("petty_cash_balance").insert(inflowsToInsert);
      infErr = error;
    }
    if (requestsToInsert.length) {
      const { error } = await supabase.from("requests").insert(requestsToInsert);
      reqErr = error;
    }

    const errs = [invErr, infErr, reqErr].filter(Boolean);
    if (errs.length) {
      toast.error(errs.map(e => e!.message).join("; "));
      setImporting(false);
      return;
    }

    await logAction({
      action: "excel.import.workbook",
      metadata: {
        invoices: toInsert.length,
        inflows: inflowsToInsert.length,
        requests: requestsToInsert.length,
        duplicates_skipped: preview.duplicates,
        invalid_skipped: preview.invalid,
      },
    });
    toast.success(`Imported · ${toInsert.length} invoices · ${inflowsToInsert.length} inflows · ${requestsToInsert.length} requests`);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";

    const [{ data: i2 }, { data: f2 }, { data: r2 }] = await Promise.all([
      supabase.from("invoices").select("*").order("invoice_date", { ascending: false }),
      supabase.from("petty_cash_balance").select("*").order("created_at", { ascending: false }),
      supabase.from("requests").select("*").order("created_at", { ascending: false }),
    ]);
    setInvoices((i2 as Inv[]) ?? []);
    setInflows((f2 as Inflow[]) ?? []);
    setRequests((r2 as Req[]) ?? []);
    setImporting(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Integrations</div>
          <h1 className="font-display text-3xl tracking-tight">Excel Sync</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Import & export operational data. The internal database remains the source of truth.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 self-start">
          <Cloud className="h-3 w-3" /> Microsoft Graph: not connected
        </Badge>
      </div>

      <Tabs defaultValue="export">
        <TabsList>
          <TabsTrigger value="export"><FileDown className="mr-1.5 h-4 w-4" />Export</TabsTrigger>
          <TabsTrigger value="import" disabled={!canImport}><FileUp className="mr-1.5 h-4 w-4" />Import</TabsTrigger>
          <TabsTrigger value="graph">Microsoft Graph</TabsTrigger>
        </TabsList>

        <TabsContent value="export" className="space-y-4">
          <Card className="p-5">
            <div className="font-display text-lg">Export to Excel</div>
            <p className="mt-1 text-sm text-muted-foreground">Same column layout as the operational spreadsheet.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Button onClick={() => downloadXLSX("invoices")} variant="outline" className="justify-start">
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Invoices ({invoices.length})
              </Button>
              <Button onClick={() => downloadXLSX("inflows")} variant="outline" className="justify-start">
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Cash Inflows ({inflows.length})
              </Button>
              <Button onClick={() => downloadXLSX("requests")} variant="outline" className="justify-start">
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Requests ({requests.length})
              </Button>
              <Button onClick={() => downloadXLSX("all")} className="justify-start bg-gradient-primary text-primary-foreground">
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Full workbook
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="import" className="space-y-4">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-display text-lg">Import invoices</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Required columns: Invoice Number, Vendor, Date, Amount, Category. Duplicates are detected by Invoice Number.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <FileDown className="mr-1.5 h-4 w-4" /> Template
              </Button>
            </div>

            <div className="mt-4">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="block w-full cursor-pointer rounded-md border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground hover:bg-muted/50"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          </Card>

          {preview && (
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div className="font-display text-lg">Import preview</div>
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = ""; }}>
                  Discard
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Ready to import</div>
                  <div className="mt-1 font-display text-2xl">{preview.valid}</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Duplicates</div>
                  <div className="mt-1 font-display text-2xl">{preview.duplicates}</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5 text-rose-500" /> Invalid</div>
                  <div className="mt-1 font-display text-2xl">{preview.invalid}</div>
                </div>
              </div>

              <div className="mt-4 max-h-80 overflow-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/60">
                    <tr className="text-left">
                      <th className="px-2 py-2">#</th>
                      <th className="px-2 py-2">Invoice #</th>
                      <th className="px-2 py-2">Vendor</th>
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2 text-right">Amount</th>
                      <th className="px-2 py-2">Category</th>
                      <th className="px-2 py-2">Issue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {preview.rows.slice(0, 200).map((r, idx) => {
                      const num = String(r["Invoice Number"] ?? "");
                      const isDup = preview.duplicateNumbers.includes(num);
                      const issue = preview.invalidReasons[idx] ?? (isDup ? "Duplicate" : "");
                      return (
                        <tr key={idx} className={issue ? "bg-destructive/5" : ""}>
                          <td className="px-2 py-1.5 font-mono text-muted-foreground">{idx + 1}</td>
                          <td className="px-2 py-1.5 font-mono">{num}</td>
                          <td className="px-2 py-1.5">{String(r["Vendor"] ?? "")}</td>
                          <td className="px-2 py-1.5">{String(r["Date"] ?? "")}</td>
                          <td className="px-2 py-1.5 text-right font-num">{String(r["Amount"] ?? "")}</td>
                          <td className="px-2 py-1.5">{String(r["Category"] ?? "")}</td>
                          <td className="px-2 py-1.5 text-xs text-muted-foreground">{issue}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = ""; }}>Cancel</Button>
                <Button
                  disabled={preview.valid === 0 || importing}
                  onClick={confirmImport}
                  className="bg-gradient-primary text-primary-foreground"
                >
                  {importing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileUp className="mr-1.5 h-4 w-4" />}
                  Confirm import ({preview.valid})
                </Button>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="graph">
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Cloud className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <div className="font-display text-lg">Microsoft Graph (SharePoint Excel)</div>
                <div className="text-xs text-muted-foreground">Future integration · scaffolding ready</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-md border border-border p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Workbook</div>
                <div className="mt-1 break-all font-mono text-xs">staffingglobalorg.sharepoint.com/...</div>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Status</div>
                <div className="mt-1"><Badge variant="outline">Not connected</Badge></div>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Live two-way sync with the SharePoint workbook will use the Microsoft Graph Excel API. The current MVP relies on file-based import/export above.
            </p>
            <Button className="mt-4" variant="outline" disabled>Connect Microsoft Graph (coming soon)</Button>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
