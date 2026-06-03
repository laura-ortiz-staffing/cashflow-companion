import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload as UploadIcon, FileText, Sparkles, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { logAction } from "@/lib/audit";

export const Route = createFileRoute("/upload")({
  component: () => <AppShell><UploadGuard /></AppShell>,
});

function UploadGuard() {
  const { role, permissions } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (role === "admin" && !permissions.includes("upload")) {
      navigate({ to: "/cash" });
    }
  }, [role, permissions, navigate]);
  if (role === "admin" && !permissions.includes("upload")) return null;
  return <Upload />;
}

const CATEGORIES = ["office_supplies", "travel", "meals", "transport", "utilities", "maintenance", "marketing", "other"];

function Upload() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [vendor, setVendor] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceNumberSource, setInvoiceNumberSource] = useState<"manual" | "ocr">("manual");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState("other");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const fileToBase64 = (f: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(f);
  });

  const handleFileChange = async (f: File | null) => {
    setFile(f);
    if (!f) return;
    if (!f.type.startsWith("image/") && f.type !== "application/pdf") return;

    setExtracting(true);
    const toastId = toast.loading("Reading invoice with AI…");
    try {
      const fileBase64 = await fileToBase64(f);
      const { data, error } = await supabase.functions.invoke("extract-invoice", {
        body: { fileBase64, mimeType: f.type },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data.vendor) setVendor(data.vendor);
      if (typeof data.amount === "number") setAmount(String(data.amount));
      if (data.invoice_date) setDate(data.invoice_date);
      if (data.category && CATEGORIES.includes(data.category)) setCategory(data.category);
      if (data.invoice_number && typeof data.invoice_number === "string") {
        setInvoiceNumber(data.invoice_number);
        setInvoiceNumberSource("ocr");
      }

      toast.success("Fields auto-filled — please review", { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auto-fill failed", { id: toastId });
    } finally {
      setExtracting(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      let file_url: string | null = null;
      let file_name: string | null = null;

      if (file) {
        const ext = file.name.split(".").pop();
        const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("invoices").upload(path, file);
        if (upErr) throw upErr;
        file_url = path;
        file_name = file.name;
      }

      const initialStatus = role === "super_admin" ? "approved" : "submitted";
      const { data, error } = await supabase.from("invoices").insert({
        amount: Number(amount),
        vendor,
        invoice_number: invoiceNumber.trim(),
        invoice_number_source: invoiceNumberSource,
        invoice_date: date,
        category: category as "office_supplies",
        notes: notes || null,
        file_url, file_name,
        uploaded_by: user.id,
        status: initialStatus,
        ...(initialStatus === "approved" ? {
          locked: true,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString()
        } : {})
      }).select().single();
      if (error) throw error;

      await logAction({
        action: "invoice.upload",
        entity_type: "invoice", entity_id: data.id,
        new_state: { vendor, amount, category, invoice_number: invoiceNumber, status: initialStatus },
      });

      toast.success(role === "super_admin" ? "Invoice submitted and approved" : "Invoice submitted for review");
      navigate({ to: "/invoices/$id", params: { id: data.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Intake</div>
        <h1 className="font-display text-3xl tracking-tight">Upload invoice</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Submit a receipt or invoice for validation. Once approved, the record is locked.
        </p>
      </div>

      <Card className="p-6">
        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="invoice_number" className="flex items-center gap-2">
                Invoice number *
                {invoiceNumberSource === "ocr" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
                    <Sparkles className="h-3 w-3" /> auto-extracted
                  </span>
                )}
              </Label>
              <Input
                id="invoice_number" value={invoiceNumber}
                onChange={(e) => { setInvoiceNumber(e.target.value); setInvoiceNumberSource("manual"); }}
                required maxLength={60} placeholder="e.g. FAC-001234"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vendor">Vendor *</Label>
              <Input id="vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} required maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount *</Label>
              <Input id="amount" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date">Invoice date *</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Optional context for the approver…" />
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              Receipt file
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
                <Sparkles className="h-3 w-3" /> AI auto-fill
              </span>
            </Label>
            <label className={`flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 transition-colors ${extracting ? "border-primary bg-primary/5" : "border-border bg-muted/30 hover:border-primary hover:bg-muted/50"}`}>
              {extracting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Reading invoice and extracting fields…</span>
                </>
              ) : file ? (
                <>
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-sm font-medium">{file.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</div>
                  </div>
                </>
              ) : (
                <>
                  <UploadIcon className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Click to attach receipt (PDF or image) — fields will auto-fill</span>
                </>
              )}
              <input type="file" accept="image/*,.pdf" className="hidden" disabled={extracting} onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={busy} className="bg-gradient-primary text-primary-foreground">
              {busy ? "Submitting…" : role === "super_admin" ? "Submit" : "Submit for review"}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate({ to: "/invoices" })}>Cancel</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
