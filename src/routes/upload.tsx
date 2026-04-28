import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  component: () => <AppShell><Upload /></AppShell>,
});

const CATEGORIES = ["office_supplies", "travel", "meals", "transport", "utilities", "maintenance", "marketing", "other"];

function Upload() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [vendor, setVendor] = useState("");
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

      toast.success("Fields auto-filled — please review", { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auto-fill failed", { id: toastId });
    } finally {
      setExtracting(false);
    }
  };

  if (role !== "super_admin" && role !== "admin_uploader") {
    return <div className="text-sm text-muted-foreground">You don't have permission to upload invoices.</div>;
  }

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

      const { data, error } = await supabase.from("invoices").insert({
        amount: Number(amount),
        vendor, invoice_date: date,
        category: category as "office_supplies",
        notes: notes || null,
        file_url, file_name,
        uploaded_by: user.id,
        status: "submitted",
      }).select().single();
      if (error) throw error;

      await logAction({
        action: "invoice.upload",
        entity_type: "invoice", entity_id: data.id,
        new_state: { vendor, amount, category, status: "submitted" },
      });

      toast.success("Invoice submitted for review");
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
            <div className="space-y-1.5">
              <Label htmlFor="vendor">Vendor *</Label>
              <Input id="vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} required maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount (USD) *</Label>
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
            <Label>Receipt file</Label>
            <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-8 transition-colors hover:border-primary hover:bg-muted/50">
              {file ? (
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
                  <span className="text-sm text-muted-foreground">Click to attach receipt (PDF or image)</span>
                </>
              )}
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={busy} className="bg-gradient-primary text-primary-foreground">
              {busy ? "Submitting…" : "Submit for review"}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate({ to: "/invoices" })}>Cancel</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
