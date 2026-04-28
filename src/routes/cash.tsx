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
import { Wallet, TrendingUp, Lock, Plus, Sparkles, Loader2, FileText, Upload as UploadIcon } from "lucide-react";
import { format } from "date-fns";
import { logAction } from "@/lib/audit";

export const Route = createFileRoute("/cash")({
  component: () => <AppShell><Cash /></AppShell>,
});

type Settings = { opening_balance: number; currency: string; updated_at: string; updated_by: string | null };
type Movement = { id: string; type: string; amount: number; description: string | null; created_at: string; created_by: string };

function fmt(n: number, ccy = "COP") {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(n);
}

function Cash() {
  const { role } = useAuth();
  const isAdmin = role === "super_admin";
  const [settings, setSettings] = useState<Settings | null>(null);
  const [inflows, setInflows] = useState<Movement[]>([]);
  const [approvedTotal, setApprovedTotal] = useState(0);

  // edit balance dialog
  const [editOpen, setEditOpen] = useState(false);
  const [newBalance, setNewBalance] = useState("");
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  // inflow form
  const [inflowAmount, setInflowAmount] = useState("");
  const [inflowDesc, setInflowDesc] = useState("");
  const [inflowFile, setInflowFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);

  const fileToBase64 = (f: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(f);
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

  const load = async () => {
    const [{ data: s }, { data: m }, { data: inv }] = await Promise.all([
      supabase.from("cash_settings").select("*").eq("id", true).maybeSingle(),
      supabase.from("petty_cash_balance").select("*").eq("type", "inflow").order("created_at", { ascending: false }),
      supabase.from("invoices").select("amount").eq("status", "approved"),
    ]);
    if (s) setSettings(s as Settings);
    setInflows((m as Movement[]) ?? []);
    setApprovedTotal(((inv as { amount: number }[]) ?? []).reduce((acc, i) => acc + Number(i.amount), 0));
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("cash-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_settings" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "petty_cash_balance" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const opening = Number(settings?.opening_balance ?? 0);
  const inflowsTotal = inflows.reduce((s, m) => s + Number(m.amount), 0);
  const current = opening + inflowsTotal - approvedTotal;
  const ccy = settings?.currency ?? "COP";

  const openEdit = () => {
    setNewBalance(String(opening));
    setNote("");
    setEditOpen(true);
  };

  const handleSubmitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = Number(newBalance);
    if (!Number.isFinite(v) || v < 0) {
      toast.error("Enter a valid non-negative amount");
      return;
    }
    setEditOpen(false);
    setConfirmOpen(true);
  };

  const confirmUpdate = async () => {
    const v = Number(newBalance);
    const prev = opening;
    const { error } = await supabase.from("cash_settings")
      .update({ opening_balance: v }).eq("id", true);
    if (error) { toast.error(error.message); return; }
    if (note.trim()) {
      await logAction({
        action: "opening_balance.note",
        entity_type: "cash_settings",
        metadata: { note: note.trim(), previous: prev, new: v },
      });
    }
    toast.success("Opening balance updated");
    setConfirmOpen(false);
  };

  const addInflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const amt = Number(inflowAmount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Amount must be greater than zero"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("petty_cash_balance").insert({
      type: "inflow", amount: amt, description: inflowDesc || null, created_by: user.id,
    });
    if (error) { toast.error(error.message); return; }
    await logAction({
      action: "cash.inflow_added",
      entity_type: "petty_cash_balance",
      metadata: { amount: amt, description: inflowDesc || null },
    });
    toast.success("Inflow recorded");
    setInflowAmount(""); setInflowDesc(""); setInflowFile(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Treasury</div>
        <h1 className="font-display text-3xl tracking-tight">Cash control</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage the opening balance and record cash inflows.
        </p>
      </div>

      {/* Balance summary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2 bg-gradient-tertiary text-tertiary-foreground shadow-glow">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest opacity-80">Current balance</div>
              <div className="mt-2 font-display text-4xl tracking-tight">{fmt(current, ccy)}</div>
              <div className="mt-1 font-mono text-xs opacity-70">
                opening {fmt(opening, ccy)} + inflows {fmt(inflowsTotal, ccy)} − expenses {fmt(approvedTotal, ccy)}
              </div>
            </div>
            <Wallet className="h-6 w-6 opacity-80" />
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Opening balance</div>
            {!isAdmin && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
          <div className="mt-2 font-display text-2xl tracking-tight">{fmt(opening, ccy)}</div>
          {settings?.updated_at && (
            <div className="mt-1 font-mono text-[11px] text-muted-foreground">
              updated {format(new Date(settings.updated_at), "MMM d, yyyy HH:mm")}
            </div>
          )}
          <Button
            className="mt-4 w-full"
            variant="outline"
            disabled={!isAdmin}
            onClick={openEdit}
          >
            {isAdmin ? "Edit opening balance" : "Super Admin only"}
          </Button>
        </Card>
      </div>

      {/* Inflows */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {isAdmin && (
          <Card className="p-5 lg:col-span-1">
            <div className="mb-4 flex items-center gap-2">
              <Plus className="h-4 w-4 text-success" />
              <h3 className="font-display text-lg">Add cash inflow</h3>
            </div>
            <form onSubmit={addInflow} className="space-y-3">
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
              <Button type="submit" className="w-full">Record inflow</Button>
            </form>
          </Card>
        )}

        <Card className={`p-5 ${isAdmin ? "lg:col-span-2" : "lg:col-span-3"}`}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-success" />
              <h3 className="font-display text-lg">Cash inflows</h3>
            </div>
            <span className="font-mono text-xs text-muted-foreground">{inflows.length} entries</span>
          </div>
          {inflows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No inflows recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {inflows.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-medium">{m.description || "Cash inflow"}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {format(new Date(m.created_at), "MMM d, yyyy HH:mm")}
                    </div>
                  </div>
                  <div className="font-num text-sm font-semibold text-success">+{fmt(Number(m.amount), ccy)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Edit dialog */}
      <AlertDialog open={editOpen} onOpenChange={setEditOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit opening balance</AlertDialogTitle>
            <AlertDialogDescription>
              This is the base value for all calculations. Historical records remain unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form onSubmit={handleSubmitEdit} className="space-y-3">
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest">New opening balance ({ccy})</Label>
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

      {/* Confirm */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm balance update</AlertDialogTitle>
            <AlertDialogDescription>
              Change opening balance from <strong>{fmt(opening, ccy)}</strong> to{" "}
              <strong>{fmt(Number(newBalance || 0), ccy)}</strong>? This action will be recorded in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUpdate}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
