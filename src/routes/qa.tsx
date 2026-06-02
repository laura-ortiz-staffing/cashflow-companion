import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { HelpCircle, Search, Send, ThumbsDown, ThumbsUp, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/qa")({
  component: () => <AppShell><QA /></AppShell>,
});

const FAQ: { q: string; a: string }[] = [
  { q: "What is petty cash in Colombia?",
    a: "Petty cash (caja menor) is a small amount of company money used to pay for minor day-to-day expenses (transport, supplies, small services). In Colombia it must be supported by valid receipts or electronic invoices and reconciled regularly." },
  { q: "What is an invoice number?",
    a: "It is the unique identifier the vendor assigns to their invoice (often shown as 'No. Factura' or 'CUFE' for electronic invoices). It allows traceability and prevents duplicate registration of the same expense." },
  { q: "What is RUT?",
    a: "RUT (Registro Único Tributario) is the Colombian tax registry ID issued by DIAN. Every business and many individuals must have one to issue invoices and operate legally." },
  { q: "What is NIT?",
    a: "NIT (Número de Identificación Tributaria) is the tax ID number assigned to legal entities. It usually appears on the vendor's invoice along with their company name." },
  { q: "What is IVA?",
    a: "IVA (Impuesto sobre el Valor Agregado) is Colombia's value-added tax (VAT). The general rate is 19%, with reduced rates (5%) or exemptions for some goods and services. On a valid invoice, IVA is shown as a separate line so the buyer can see the taxable base, the IVA amount, and the total." },
  { q: "What information must a Colombian invoice include?",
    a: "A valid Colombian electronic invoice typically includes: vendor name and NIT, buyer info, invoice number, issue date, description of goods/services, amount, IVA (VAT) when applicable, and the CUFE (electronic verification code)." },
  { q: "How are expenses classified in Colombia?",
    a: "Companies group expenses by category for accounting (e.g. office supplies, travel, meals, transport, utilities, maintenance, marketing). In this app you pick a category when uploading an invoice." },
  { q: "Why do invoices need approval?",
    a: "Approval ensures that every expense is reviewed by a Super Admin before it impacts the petty cash balance. This protects the company from fraud and accounting errors." },
  { q: "How do I read the dashboard?",
    a: "The dashboard shows the current available balance = opening balance + approved cash inflows − approved expenses. Cards show totals; lists show recent activity." },
  { q: "What does 'approved expense' mean?",
    a: "An expense (invoice) that a Super Admin has reviewed and accepted. Once approved it is locked, counted against the balance, and cannot be edited." },
  { q: "What does 'cash inflow' mean?",
    a: "Money entering the petty cash fund — for example a refill from the main account or a returned amount. Inflows increase the available balance once registered." },
];

type Msg = { role: "user" | "assistant"; content: string };

function QA() {
  const { user, role, permissions } = useAuth();
  const [query, setQuery] = useState("");
  const [chat, setChat] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);

  const filteredFaq = FAQ.filter((f) =>
    !query || f.q.toLowerCase().includes(query.toLowerCase()) || f.a.toLowerCase().includes(query.toLowerCase())
  );

  const ask = async (e?: FormEvent) => {
    e?.preventDefault();
    const question = query.trim();
    if (!question) return;
    setBusy(true);
    setChat((c) => [...c, { role: "user", content: question }]);
    setQuery("");
    try {
      const { data, error } = await supabase.functions.invoke("qa-chat", {
        body: { question, history: chat.slice(-6), role, permissions },
      });
      if (error) throw error;
      const answer = (data as { answer?: string })?.answer ?? "No answer.";
      setChat((c) => [...c, { role: "assistant", content: answer }]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to get answer");
    } finally {
      setBusy(false);
    }
  };

  const askSuggestion = (q: string) => { setQuery(q); setTimeout(() => ask(), 0); };

  const feedback = async (msgIndex: number, helpful: boolean) => {
    if (!user) return;
    const a = chat[msgIndex];
    const q = chat[msgIndex - 1];
    if (!a || !q) return;
    await supabase.from("qa_feedback").insert({
      user_id: user.id, question: q.content, answer: a.content, helpful,
    });
    toast.success(helpful ? "Thanks for the feedback!" : "Noted — we'll improve.");
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Help center</div>
        <h1 className="font-display text-3xl tracking-tight">Q&amp;A</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Learn about Colombian petty cash, invoices, and how to use the app. General guidance only — for company-specific decisions, ask the Super Admin.
        </p>
      </div>

      <Card className="p-4">
        <form onSubmit={ask} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search FAQs or ask a question…"
              className="pl-9"
            />
          </div>
          <Button type="submit" disabled={busy} className="gap-2">
            <Send className="h-4 w-4" /> {busy ? "Asking…" : "Ask"}
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {["What is RUT?", "What is NIT?", "How do I upload an invoice?", "What does approved mean?"].map((s) => (
            <button key={s} type="button" onClick={() => askSuggestion(s)}
              className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs hover:bg-muted">
              <Sparkles className="mr-1 inline h-3 w-3" />{s}
            </button>
          ))}
        </div>
      </Card>

      {chat.length > 0 && (
        <Card className="space-y-4 p-5">
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Conversation</div>
          {chat.map((m, i) => (
            <div key={i} className={m.role === "user" ? "rounded-lg bg-muted/40 p-3" : "rounded-lg border border-border p-3"}>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {m.role === "user" ? "You" : "Assistant"}
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
              {m.role === "assistant" && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => feedback(i, true)}><ThumbsUp className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => feedback(i, false)}><ThumbsDown className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Frequently asked
        </div>
        <div className="divide-y divide-border">
          {filteredFaq.map((f) => (
            <details key={f.q} className="group px-5 py-4">
              <summary className="flex cursor-pointer items-start gap-2 text-sm font-medium">
                <HelpCircle className="mt-0.5 h-4 w-4 text-primary" />
                <span>{f.q}</span>
              </summary>
              <p className="mt-2 pl-6 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
          {filteredFaq.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No FAQ matches. Try asking the assistant above.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
