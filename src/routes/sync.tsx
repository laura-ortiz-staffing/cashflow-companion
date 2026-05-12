import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, FileDown, FileUp, AlertTriangle, CheckCircle2, Cloud, Loader2 } from "lucide-react";
import * as ExcelJS from "exceljs";
import { format } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { downloadWorkbook, sheetToObjects } from "@/lib/excel";

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
    const wb = new ExcelJS.Workbook();

    if (kind === "invoices" || kind === "all") {
      const ws = wb.addWorksheet("Invoices");
      ws.columns = [
        { header: "Invoice Number", key: "invoice_number" },
        { header: "Vendor", key: "vendor" },
        { header: "Date", key: "date" },
        { header: "Amount", key: "amount" },
        { header: "Category", key: "category" },
        { header: "Status", key: "status" },
        { header: "Notes", key: "notes" },
      ];
      ws.addRows(invoices.map(i => ({
        invoice_number: i.invoice_number,
        vendor: i.vendor,
        date: i.invoice_date,
        amount: Number(i.amount),
        category: i.category,
        status: i.status,
        notes: i.notes ?? "",
      })));
    }
    if (kind === "inflows" || kind === "all") {
      const ws = wb.addWorksheet("Cash Inflows");
      ws.columns = [
        { header: "Date", key: "date" },
        { header: "Type", key: "type" },
        { header: "Amount", key: "amount" },
        { header: "Description", key: "description" },
      ];
      ws.addRows(inflows.map(i => ({
        date: i.created_at.slice(0, 10),
        type: i.type,
        amount: Number(i.amount),
        description: i.description ?? "",
      })));
    }
    if (kind === "requests" || kind === "all") {
      const ws = wb.addWorksheet("Requests");
      ws.columns = [
        { header: "Title", key: "title" },
        { header: "Amount", key: "amount" },
        { header: "Currency", key: "currency" },
        { header: "Category", key: "category" },
        { header: "Status", key: "status" },
        { header: "Description", key: "description" },
        { header: "Date", key: "date" },
      ];
      ws.addRows(requests.map(r => ({
        title: r.title,
        amount: Number(r.amount),
        currency: r.currency,
        category: r.category,
        status: r.status,
        description: r.description ?? "",
        date: r.created_at.slice(0, 10),
      })));
    }

    const filename = `petty-cash-${kind}-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
    await downloadWorkbook(wb, filename);
    await logAction({ action: `excel.export.${kind}`, metadata: { filename, count: { invoices: invoices.length, inflows: inflows.length, requests: requests.length } } });
    toast.success("Excel exported");
  };

  const downloadTemplate = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Invoices");
    ws.columns = [
      { header: "Invoice Number", key: "invoice_number" },
      { header: "Vendor", key: "vendor" },
      { header: "Date", key: "date" },
      { header: "Amount", key: "amount" },
      { header: "Category", key: "category" },
      { header: "Status", key: "status" },
      { header: "Notes", key: "notes" },
    ];
    ws.addRow({
      invoice_number: "INV-20260101-000001",
      vendor: "Sample Vendor",
      date: "2026-01-01",
      amount: 50000,
      category: "office_supplies",
      status: "submitted",
      notes: "",
    });
    await downloadWorkbook(wb, "petty-cash-import-template.xlsx");
  };

  const handleFile = async (f: File) => {
    const buf = await f.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    const invSheet = wb.getWorksheet("Invoices");
    const inflowSheet = wb.getWorksheet("Cash Inflows") ?? wb.getWorksheet("Inflows");
    const reqSheet = wb.getWorksheet("Requests");
    const sheet = invSheet ?? wb.worksheets[0];
    const rows = sheetToObjects(sheet);

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

    const inflowRows = sheetToObjects(inflowSheet);
    const requestRows = sheetToObjects(reqSheet);

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
      if (dateRaw instanceof Date) {
        dateStr = `${dateRaw.getFullYear()}-${String(dateRaw.getMonth() + 1).padStart(2, "0")}-${String(dateRaw.getDate()).padStart(2, "0")}`;
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
                <div className="font-display text-lg">Import workbook</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sheets recognized: <span className="font-mono">Invoices</span>, <span className="font-mono">Cash Inflows</span>, <span className="font-mono">Requests</span>. Invoice duplicates detected by Invoice Number.
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
                          <td className="px-2 py-1.5">{r["Date"] instanceof Date ? format(r["Date"], "yyyy-MM-dd") : String(r["Date"] ?? "")}</td>
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
                  disabled={(preview.valid === 0 && preview.inflowRows.length === 0 && preview.requestRows.length === 0) || importing}
                  onClick={confirmImport}
                  className="bg-gradient-primary text-primary-foreground"
                >
                  {importing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileUp className="mr-1.5 h-4 w-4" />}
                  Confirm import · {preview.valid} inv · {preview.inflowRows.length} inf · {preview.requestRows.length} req
                </Button>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="graph">
          <GraphSyncPanel canManage={role === "super_admin"} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type GraphState = {
  workbook_url: string | null;
  drive_id: string | null;
  item_id: string | null;
  subscription_id: string | null;
  subscription_expires_at: string | null;
  status: "disconnected" | "connecting" | "connected" | "error";
  last_error: string | null;
  last_push_at: string | null;
  last_pull_at: string | null;
  updated_at: string;
};

function GraphSyncPanel({ canManage }: { canManage: boolean }) {
  const [state, setState] = useState<GraphState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      // graph_sync_state is added by migration 20260508120000_graph_sync.sql.
      // After running `supabase gen types`, this cast can be removed.
      const { data } = await (supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => { eq: (k: string, v: unknown) => { maybeSingle: () => Promise<{ data: unknown }> } };
        };
      })
        .from("graph_sync_state")
        .select("*")
        .eq("id", true)
        .maybeSingle();
      setState((data as GraphState | null) ?? null);
    };
    load();
    const ch = supabase
      .channel("graph-sync-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "graph_sync_state" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const runBootstrap = async () => {
    if (!canManage) return;
    setBusy(true);
    const toastId = toast.loading("Connecting to Microsoft Graph…");
    try {
      const { data, error } = await supabase.functions.invoke("graph-bootstrap", {
        body: {},
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Microsoft Graph connected", { id: toastId });
      await logAction({ action: "graph.bootstrap", metadata: data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg, { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  const status = state?.status ?? "disconnected";
  const statusVariant: Record<typeof status, "default" | "secondary" | "destructive" | "outline"> = {
    connected: "default", connecting: "secondary", error: "destructive", disconnected: "outline",
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Cloud className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <div className="font-display text-lg">Microsoft Graph (SharePoint Excel)</div>
          <div className="text-xs text-muted-foreground">Two-way sync with the configured workbook</div>
        </div>
        <Badge variant={statusVariant[status]} className="capitalize">{status}</Badge>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-md border border-border p-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Workbook</div>
          <div className="mt-1 break-all font-mono text-xs">
            {state?.workbook_url ?? "—"}
          </div>
        </div>
        <div className="rounded-md border border-border p-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Subscription</div>
          <div className="mt-1 font-mono text-xs">
            {state?.subscription_id
              ? <>id <span className="opacity-70">{state.subscription_id.slice(0, 8)}…</span> · expires {state.subscription_expires_at ? format(new Date(state.subscription_expires_at), "yyyy-MM-dd HH:mm") : "?"}</>
              : "—"}
          </div>
        </div>
        <div className="rounded-md border border-border p-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Last push (DB → Excel)</div>
          <div className="mt-1 font-mono text-xs">
            {state?.last_push_at ? format(new Date(state.last_push_at), "yyyy-MM-dd HH:mm:ss") : "never"}
          </div>
        </div>
        <div className="rounded-md border border-border p-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Last pull (Excel → DB)</div>
          <div className="mt-1 font-mono text-xs">
            {state?.last_pull_at ? format(new Date(state.last_pull_at), "yyyy-MM-dd HH:mm:ss") : "never"}
          </div>
        </div>
      </div>

      {state?.last_error && (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <div className="font-mono uppercase tracking-wider">Last error</div>
          <div className="mt-1 break-words">{state.last_error}</div>
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Bootstrap resolves the SharePoint workbook from <code className="font-mono">MS_WORKBOOK_URL</code>, verifies the three Excel Tables exist, and creates a Microsoft Graph change-notification subscription. Run it once after Azure AD credentials are configured, and again whenever the subscription is about to expire.
      </p>
      <Button
        className="mt-4"
        variant={status === "connected" ? "outline" : "default"}
        onClick={runBootstrap}
        disabled={!canManage || busy}
      >
        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Cloud className="mr-1.5 h-4 w-4" />}
        {status === "connected" ? "Reconnect / renew subscription" : "Connect Microsoft Graph"}
      </Button>
      {!canManage && (
        <p className="mt-2 text-xs text-muted-foreground">Only Super Admins can manage this connection.</p>
      )}
    </Card>
  );
}
