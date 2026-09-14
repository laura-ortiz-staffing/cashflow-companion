import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Wallet, TrendingUp, Lock, Plus, Sparkles, Loader2,
  FileText, Upload as UploadIcon, ChevronLeft, ChevronRight,
  AlertTriangle, Pencil, Trash2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { logAction } from "@/lib/audit";

export const Route = createFileRoute("/cash")({
  component: () => <AppShell><Cash /></AppShell>,
});

type Settings = { opening_balance: number; monthly_fund: number | null; currency: string };
type Period   = { id: string; year: number; month: number; opening_balance: number };
type Movement = { id: string; type: string; amount: number; description: string | null; created_at: string; transaction_date: string };

function fmt(n: number, ccy = "COP") {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(n);
}

function Cash() {
  const { role, permissions } = useAuth();
  const isSuperAdmin  = role === "super_admin";
  const canSeeBalance = role === "super_admin" || role === "admin" || permissions.includes("cash");

  const today = new Date();
  const currentYear  = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  const [viewYear,  setViewYear]  = useState(currentYear);
  const [viewMonth, setViewMonth] = useState(currentMonth);

  const [settings,      setSettings]      = useState<Settings | null>(null);
  const [period,        setPeriod]        = useState<Period | null>(null);
  const [inflows,       setInflows]       = useState<Movement[]>([]);
  const [approvedTotal, setApprovedTotal] = useState(0);

  // dialogs
  const [editOpen,    setEditOpen]    = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [fundOpen,    setFundOpen]    = useState(false);
  const [newBalance, setNewBalance] = useState("");
  const [newFund,    setNewFund]    = useState("");
  const [note, setNote] = useState("");

  // inflow form
  const [inflowAmount, setInflowAmount] = useState("");
  const [inflowDesc,   setInflowDesc]   = useState("");
  const [inflowDate,   setInflowDate]   = useState(new Date().toISOString().slice(0, 10));
  const [inflowFile,   setInflowFile]   = useState<File | null>(null);
  const [extracting,   setExtracting]   = useState(false);
  const [inflowDupes,  setInflowDupes]  = useState<Movement[]>([]);

  // inflow edit/delete
  const [editingInflow,   setEditingInflow]   = useState<Movement | null>(null);
  const [editAmt,         setEditAmt]         = useState("");
  const [editDesc,        setEditDesc]        = useState("");
  const [editDate,        setEditDate]        = useState("");
  const [deletingInflow,  setDeletingInflow]  = useState<Movement | null>(null);
  const [inflowBusy,      setInflowBusy]      = useState(false);

  const isCurrentMonth = viewYear === currentYear && viewMonth === currentMonth;
  const isFuture = new Date(viewYear, viewMonth - 1, 1) > today;

  const monthStart = `${viewYear}-${String(viewMonth).padStart(2, "0")}-01`;
  const nextY = viewMonth === 12 ? viewYear + 1 : viewYear;
  const nextM = viewMonth === 12 ? 1 : viewMonth + 1;
  const monthEnd = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
  const viewLabel = new Date(viewYear, viewMonth - 1, 1)
    .toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const load = async () => {
    const [{ data: s }, { data: p }, { data: m }, { data: inv }] = await Promise.all([
      supabase.from("cash_settings").select("*").eq("id", true).maybeSingle(),
      (supabase as any).from("cash_periods").select("*")
        .eq("year", viewYear).eq("month", viewMonth).maybeSingle(),
      supabase.from("petty_cash_balance").select("*").eq("type", "inflow")
        .gte("transaction_date", monthStart)
        .lt("transaction_date",  monthEnd)
        .order("transaction_date", { ascending: false }),
      supabase.from("invoices").select("amount").eq("status", "approved")
        .gte("invoice_date", monthStart)
        .lt("invoice_date",  monthEnd),
    ]);

    const sData = s as Settings | null;
    if (sData) setSettings(sData);

    let pData = p as Period | null;
    if (!pData && viewYear === currentYear && viewMonth === currentMonth && isSuperAdmin && sData) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Opening balance starts at 0 — all real cash enters as inflows.
        // The monthly_fund setting is informational only (budget reference).
        await (supabase as any).from("cash_periods")
          .insert({ year: viewYear, month: viewMonth, opening_balance: 0, created_by: user.id });
        const { data: re } = await (supabase as any).from("cash_periods")
          .select("*").eq("year", viewYear).eq("month", viewMonth).maybeSingle();
        pData = re as Period | null;
      }
    }

    setPeriod(pData);
    setInflows((m as unknown as Movement[]) ?? []);
    setApprovedTotal(((inv as { amount: number }[]) ?? []).reduce((a, i) => a + Number(i.amount), 0));
  };

  // Duplicate-inflow detection: same amount within the last 7 days
  useEffect(() => {
    const amt = Number(inflowAmount);
    if (!inflowAmount || !Number.isFinite(amt) || amt <= 0) { setInflowDupes([]); return; }
    const timer = setTimeout(async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { data } = await supabase.from("petty_cash_balance")
        .select("id, type, amount, description, created_at")
        .eq("type", "inflow")
        .eq("amount", amt)
        .gte("created_at", sevenDaysAgo)
        .limit(5);
      setInflowDupes((data as Movement[]) ?? []);
    }, 450);
    return () => clearTimeout(timer);
  }, [inflowAmount]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`cash-rt-${viewYear}-${viewMonth}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_settings" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_periods" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "petty_cash_balance" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [viewYear, viewMonth]);

  const opening      = period ? Number(period.opening_balance) : 0;
  const inflowsTotal = inflows.reduce((s, mv) => s + Number(mv.amount), 0);
  const current      = opening + inflowsTotal - approvedTotal;
  const ccy          = settings?.currency ?? "COP";
  const monthlyFund  = settings ? (settings.monthly_fund ?? settings.opening_balance) : 0;

  const navigateMonth = (dir: -1 | 1) => {
    const d = new Date(viewYear, viewMonth - 1 + dir, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth() + 1);
  };

  const handleSubmitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = Number(newBalance);
    if (!Number.isFinite(v) || v < 0) { toast.error("Enter a valid non-negative amount"); return; }
    setEditOpen(false);
    setConfirmOpen(true);
  };

  const confirmUpdate = async () => {
    const v = Number(newBalance);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (period) {
      const { error } = await (supabase as any).from("cash_periods")
        .update({ opening_balance: v }).eq("id", period.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await (supabase as any).from("cash_periods")
        .insert({ year: viewYear, month: viewMonth, opening_balance: v, created_by: user.id });
      if (error) { toast.error(error.message); return; }
    }
    if (note.trim()) {
      await logAction({
        action: "opening_balance.updated",
        entity_type: "cash_periods",
        metadata: { note: note.trim(), previous: opening, new: v, year: viewYear, month: viewMonth },
      });
    }
    toast.success("Opening balance updated");
    setConfirmOpen(false);
    await load();
  };

  const saveFund = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = Number(newFund);
    if (!Number.isFinite(v) || v < 0) { toast.error("Enter a valid amount"); return; }
    const { error } = await supabase.from("cash_settings")
      .update({ monthly_fund: v } as any).eq("id", true);
    if (error) { toast.error(error.message); return; }
    toast.success("Monthly fund updated");
    setFundOpen(false);
    await load();
  };

  const fileToBase64 = (f: File) => new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });

  const handleInflowFile = async (f: File | null) => {
    setInflowFile(f);
    if (!f) return;
    if (!f.type.startsWith("image/") && f.type !== "application/pdf") return;
    setExtracting(true);
    const tid = toast.loading("Reading transaction with AI…");
    try {
      const fileBase64 = await fileToBase64(f);
      const { data, error } = await supabase.functions.invoke("extract-invoice", {
        body: { fileBase64, mimeType: f.type, mode: "transaction" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (typeof data.amount === "number") setInflowAmount(String(data.amount));
      if (data.description && !inflowDesc) setInflowDesc(data.description);
      toast.success("Fields auto-filled — please review", { id: tid });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auto-fill failed", { id: tid });
    } finally {
      setExtracting(false);
    }
  };

  const addInflow = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(inflowAmount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Amount must be greater than zero"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("petty_cash_balance").insert({
      type: "inflow", amount: amt, description: inflowDesc || null,
      transaction_date: inflowDate, created_by: user.id,
    } as any);
    if (error) { toast.error(error.message); return; }
    await logAction({
      action: "cash.inflow_added",
      entity_type: "petty_cash_balance",
      metadata: { amount: amt, description: inflowDesc || null, transaction_date: inflowDate },
    });
    toast.success("Inflow recorded");
    setInflowAmount(""); setInflowDesc(""); setInflowDate(new Date().toISOString().slice(0, 10));
    setInflowFile(null); setInflowDupes([]);
    await load();
  };

  const updateInflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInflow) return;
    const amt = Number(editAmt);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Amount must be greater than zero"); return; }
    setInflowBusy(true);
    try {
      const { error } = await supabase.from("petty_cash_balance")
        .update({ amount: amt, description: editDesc || null, transaction_date: editDate } as any)
        .eq("id", editingInflow.id);
      if (error) throw error;
      await logAction({
        action: "cash.inflow_edited",
        entity_type: "petty_cash_balance",
        metadata: {
          previous: { amount: editingInflow.amount, description: editingInflow.description, transaction_date: editingInflow.transaction_date },
          new: { amount: amt, description: editDesc || null, transaction_date: editDate },
        },
      });
      toast.success("Inflow updated");
      setEditingInflow(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setInflowBusy(false);
    }
  };

  const deleteInflow = async () => {
    if (!deletingInflow) return;
    setInflowBusy(true);
    try {
      await logAction({
        action: "cash.inflow_deleted",
        entity_type: "petty_cash_balance",
        previous_state: {
          amount: deletingInflow.amount,
          description: deletingInflow.description,
          created_at: deletingInflow.created_at,
        },
      });
      const { error } = await supabase.from("petty_cash_balance").delete().eq("id", deletingInflow.id);
      if (error) throw error;
      toast.success("Inflow deleted");
      setDeletingInflow(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setInflowBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Treasury</div>
          <h1 className="font-display text-3xl tracking-tight">Cash control</h1>
          <p className="mt-1 text-sm text-muted-foreground">Monthly balance tracked per period.</p>
        </div>

        {/* Month navigator */}
        <div className="flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 shrink-0">
          <button
            onClick={() => navigateMonth(-1)}
            className="rounded p-1 hover:bg-muted transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-mono text-sm min-w-[140px] text-center">{viewLabel}</span>
          <button
            onClick={() => navigateMonth(1)}
            disabled={isCurrentMonth}
            className="rounded p-1 hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Balance summary */}
      {canSeeBalance && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2 bg-gradient-tertiary text-tertiary-foreground shadow-glow">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest opacity-80">
                  Balance · {viewLabel}
                </div>
                <div className="mt-2 font-display text-4xl tracking-tight">{fmt(current, ccy)}</div>
                <div className="mt-1 font-mono text-xs opacity-70">
                  opening {fmt(opening, ccy)} + inflows {fmt(inflowsTotal, ccy)} − expenses {fmt(approvedTotal, ccy)}
                </div>
              </div>
              <Wallet className="h-6 w-6 opacity-80" />
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            {/* Period opening */}
            <div>
              <div className="flex items-center justify-between">
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Period opening</div>
                {!isSuperAdmin && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
              <div className="mt-1 font-display text-2xl tracking-tight">{fmt(opening, ccy)}</div>
              {!period && !isCurrentMonth && (
                <div className="mt-0.5 font-mono text-[11px] text-amber-500">not configured</div>
              )}
              <Button
                className="mt-3 w-full"
                variant="outline"
                disabled={!isSuperAdmin || isFuture}
                onClick={() => { setNewBalance(String(opening)); setNote(""); setEditOpen(true); }}
              >
                {!isSuperAdmin ? "Super Admin only" : isFuture ? "Future month" : "Edit period opening"}
              </Button>
            </div>

            {/* Monthly fund */}
            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Monthly fund</div>
                {!isSuperAdmin && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
              <div className="mt-1 font-display text-xl tracking-tight">{fmt(monthlyFund, ccy)}</div>
              <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">budget reference — register actual transfers as inflows</div>
              <Button
                className="mt-2 w-full"
                variant="outline"
                size="sm"
                disabled={!isSuperAdmin}
                onClick={() => { setNewFund(String(monthlyFund)); setFundOpen(true); }}
              >
                {isSuperAdmin ? "Configure monthly fund" : "Super Admin only"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Inflows */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {!isFuture && isSuperAdmin && (
          <Card className="p-5 lg:col-span-1">
            <div className="mb-4 flex items-center gap-2">
              <Plus className="h-4 w-4 text-success" />
              <h3 className="font-display text-lg">Add cash inflow</h3>
            </div>
            <form onSubmit={addInflow} className="space-y-3">
              <div>
                <Label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest">
                  Transaction screenshot
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary normal-case tracking-normal">
                    <Sparkles className="h-3 w-3" /> AI auto-fill
                  </span>
                </Label>
                <label className={`mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-4 text-center transition-colors ${extracting ? "border-primary bg-primary/5" : "border-border bg-muted/30 hover:border-primary"}`}>
                  {extracting
                    ? <><Loader2 className="h-4 w-4 animate-spin text-primary" /><span className="text-xs text-muted-foreground">Reading transaction…</span></>
                    : inflowFile
                    ? <><FileText className="h-4 w-4 text-primary" /><span className="text-xs font-medium truncate max-w-[180px]">{inflowFile.name}</span></>
                    : <><UploadIcon className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Attach screenshot or PDF</span></>
                  }
                  <input type="file" accept="image/*,.pdf" className="hidden" disabled={extracting}
                    onChange={(e) => handleInflowFile(e.target.files?.[0] ?? null)} />
                </label>
              </div>
              <div>
                <Label htmlFor="inflowDate" className="font-mono text-[10px] uppercase tracking-widest">Transfer date</Label>
                <Input id="inflowDate" type="date" value={inflowDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setInflowDate(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="amt" className="font-mono text-[10px] uppercase tracking-widest">Amount ({ccy})</Label>
                <Input id="amt" type="number" step="1" min="1" value={inflowAmount}
                  onChange={(e) => setInflowAmount(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="desc" className="font-mono text-[10px] uppercase tracking-widest">Description</Label>
                <Input id="desc" value={inflowDesc} onChange={(e) => setInflowDesc(e.target.value)}
                  placeholder="e.g. Cash replenishment" maxLength={200} />
              </div>
              {inflowDupes.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <div>
                    <p className="text-sm font-medium text-warning-foreground">Possible duplicate transfer</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {inflowDupes.length === 1
                        ? `A ${fmt(Number(inflowAmount), ccy)} inflow was already recorded ${format(new Date(inflowDupes[0].created_at), "MMM d 'at' HH:mm")}.`
                        : `${inflowDupes.length} inflows of ${fmt(Number(inflowAmount), ccy)} already exist in the last 7 days.`
                      } Review before submitting.
                    </p>
                  </div>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={extracting}>Record inflow</Button>
            </form>
          </Card>
        )}

        <Card className={`p-5 ${!isFuture && isSuperAdmin ? "lg:col-span-2" : "lg:col-span-3"}`}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-success" />
              <h3 className="font-display text-lg">Cash inflows · {viewLabel}</h3>
            </div>
            <span className="font-mono text-xs text-muted-foreground">{inflows.length} entries</span>
          </div>
          {inflows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No inflows recorded for {viewLabel}.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {inflows.map((mv) => (
                <div key={mv.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{mv.description || "Cash inflow"}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {format(new Date(mv.transaction_date + "T12:00:00"), "MMM d, yyyy")}
                      {mv.transaction_date !== mv.created_at.slice(0, 10) && (
                        <span className="ml-1 text-muted-foreground/60">· recorded {format(new Date(mv.created_at), "MMM d")}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-num text-sm font-semibold text-success">+{fmt(Number(mv.amount), ccy)}</span>
                    {isSuperAdmin && (
                      <>
                        <button
                          onClick={() => { setEditingInflow(mv); setEditAmt(String(mv.amount)); setEditDesc(mv.description ?? ""); setEditDate(mv.transaction_date); }}
                          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Edit inflow"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingInflow(mv)}
                          className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Delete inflow"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Edit period opening */}
      <AlertDialog open={editOpen} onOpenChange={setEditOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit opening balance · {viewLabel}</AlertDialogTitle>
            <AlertDialogDescription>
              Sets the opening balance for this specific month. Historical records remain unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form onSubmit={handleSubmitEdit} className="space-y-3">
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest">Opening balance ({ccy})</Label>
              <Input type="number" step="1" min="0" value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)} required autoFocus />
            </div>
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest">Note (optional)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Reason for the change…" maxLength={500} rows={3} />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
              <Button type="submit">Continue</Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm edit */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm balance update</AlertDialogTitle>
            <AlertDialogDescription>
              Change opening balance from <strong>{fmt(opening, ccy)}</strong> to{" "}
              <strong>{fmt(Number(newBalance || 0), ccy)}</strong>? This will be recorded in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUpdate}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit inflow */}
      <Dialog open={!!editingInflow} onOpenChange={(o) => { if (!o) setEditingInflow(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit inflow</DialogTitle>
          </DialogHeader>
          <form onSubmit={updateInflow} className="space-y-3">
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest">Transfer date</Label>
              <Input type="date" value={editDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setEditDate(e.target.value)} required />
            </div>
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest">Amount ({ccy})</Label>
              <Input type="number" step="1" min="1" value={editAmt}
                onChange={(e) => setEditAmt(e.target.value)} required autoFocus />
            </div>
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest">Description</Label>
              <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                placeholder="e.g. Cash replenishment" maxLength={200} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingInflow(null)}>Cancel</Button>
              <Button type="submit" disabled={inflowBusy}>{inflowBusy ? "Saving…" : "Save changes"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete inflow */}
      <Dialog open={!!deletingInflow} onOpenChange={(o) => { if (!o) setDeletingInflow(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete inflow</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This inflow will be permanently deleted and the balance will be recalculated. The action will be recorded in the audit log.
            </p>
            {deletingInflow && (
              <div className="rounded-lg border p-3 space-y-1">
                <div className="font-medium">{deletingInflow.description || "Cash inflow"}</div>
                <div className="font-num font-semibold text-success">+{fmt(Number(deletingInflow.amount), ccy)}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {format(new Date(deletingInflow.created_at), "MMM d, yyyy HH:mm")}
                </div>
              </div>
            )}
            <p className="text-xs text-destructive">This action cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingInflow(null)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteInflow} disabled={inflowBusy}>
              {inflowBusy ? "Deleting…" : "Delete inflow"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Configure monthly fund */}
      <AlertDialog open={fundOpen} onOpenChange={setFundOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Configure monthly fund</AlertDialogTitle>
            <AlertDialogDescription>
              This amount is auto-applied as the opening balance when a new month begins.
              Months already configured are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form onSubmit={saveFund} className="space-y-3">
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest">Monthly fund ({ccy})</Label>
              <Input type="number" step="1" min="0" value={newFund}
                onChange={(e) => setNewFund(e.target.value)} required autoFocus />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
              <Button type="submit">Save</Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
