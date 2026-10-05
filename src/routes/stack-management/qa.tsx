import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { HelpCircle, Search, Send, ThumbsDown, ThumbsUp, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/stack-management/qa")({
  component: SmQA,
});

const FAQ: { q: string; a: string }[] = [
  {
    q: "What is Stack Management?",
    a: "Stack Management is the module where you track every digital tool or subscription the company pays for — software licenses, SaaS platforms, and recurring services. You can register payments, assign licenses to employees or projects, enable auto-renewal, and export reports.",
  },
  {
    q: "What's the difference between Super Admin and Viewer?",
    a: "Super Admins have full access: they can create and edit subscriptions, register payments, upload invoices, assign licenses, and manage users. Viewers have read-only access — they can browse everything and export reports but cannot make any changes.",
  },
  {
    q: "What is a subscription?",
    a: "A subscription represents any recurring service the company pays for — monthly, quarterly, or annually. It stores the service name, vendor, plan, price, license count, billing cycle, and a full history of every payment made.",
  },
  {
    q: "What happens to the history when I cancel a subscription?",
    a: "Nothing is deleted. The complete payment history, uploaded invoices, and license assignments are fully preserved. You can open a cancelled subscription at any time from the Subscriptions list (use the Cancelled filter pill) and even reactivate it.",
  },
  {
    q: "How does auto-renewal work?",
    a: "When auto-renewal is enabled, the system automatically logs a payment on the billing date every cycle. The next billing date advances to the same day of the month in the following period — it never drifts even across months with different lengths. Payments appear in the history with an AUTO badge.",
  },
  {
    q: "What does the AUTO badge mean in payment history?",
    a: "It means the payment was created automatically by the system on the billing date (not registered manually). You can still attach an invoice number or a note by clicking 'Add invoice reference' below that payment row.",
  },
  {
    q: "What currencies does the app support?",
    a: "Two currencies: COP (Colombian pesos) for petty cash payments, and USD (US dollars) for corporate card payments. Amounts are displayed with an explicit prefix (COP 150,000 or USD 29.99) to avoid confusion. In reports, COP and USD totals are shown separately.",
  },
  {
    q: "How do I reactivate a cancelled subscription?",
    a: "Open the subscription from the list (filter by Cancelled status), scroll to the status section in the detail page, and click Reactivate. The subscription returns to Active status and all its history is preserved exactly as it was.",
  },
  {
    q: "What is a license assignment?",
    a: "A license assignment links one of a subscription's paid seats to a specific person or project. Assignments can be of three types: Employee (a company employee), Client (an external client), or Project (a specific account or project). They are managed from the Members page or from each subscription's detail.",
  },
  {
    q: "How do I export a report?",
    a: "Go to Reports in the sidebar. Set your filters (date range, payment method, assignee type), then click PDF or Excel. The PDF opens the browser print dialog where you can save it. The Excel file downloads as a .xlsx with two sheets: Payments and Assignees.",
  },
  {
    q: "What billing cycles are available?",
    a: "Monthly, quarterly (every 3 months), semi-annual (every 6 months), annual, custom (a fixed number of days), and pay-as-you-go (no fixed cycle — auto-renewal does not apply to this one).",
  },
  {
    q: "Can a Viewer register payments or upload invoices?",
    a: "No. Viewers can only browse and export. To register a payment, upload an invoice, assign a license, or change a subscription's status, you need Super Admin access. Contact your Super Admin if you need those permissions.",
  },
];

type Msg = { role: "user" | "assistant"; content: string };

const renderInline = (text: string) =>
  text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        part
      ),
    );

function SmQA() {
  const { smRole } = useAuth();
  const [query, setQuery] = useState("");
  const [chat, setChat] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);

  const filteredFaq = FAQ.filter(
    (f) =>
      !query ||
      f.q.toLowerCase().includes(query.toLowerCase()) ||
      f.a.toLowerCase().includes(query.toLowerCase()),
  );

  const ask = async (e?: FormEvent) => {
    e?.preventDefault();
    const question = query.trim();
    if (!question) return;
    setBusy(true);
    setChat((c) => [...c, { role: "user", content: question }]);
    setQuery("");
    try {
      const { data, error } = await supabase.functions.invoke("sm-qa-chat", {
        body: { question, history: chat.slice(-6), smRole },
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

  const askSuggestion = (q: string) => {
    setQuery(q);
    setTimeout(() => ask(), 0);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Help center
        </div>
        <h1 className="font-display text-3xl tracking-tight">Q&amp;A</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Learn how Stack Management works — subscriptions, payments, auto-renewal, and more.
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
            <Send className="h-4 w-4" />
            {busy ? "Asking…" : "Ask"}
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            "How does auto-renewal work?",
            "What currencies are supported?",
            "Can I recover a cancelled subscription?",
            "What can a Viewer do?",
          ].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => askSuggestion(s)}
              className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs hover:bg-muted"
            >
              <Sparkles className="mr-1 inline h-3 w-3" />
              {s}
            </button>
          ))}
        </div>
      </Card>

      {chat.length > 0 && (
        <Card className="space-y-4 p-5">
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Conversation
          </div>
          {chat.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "rounded-lg bg-muted/40 p-3"
                  : "rounded-lg border border-border p-3"
              }
            >
              <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {m.role === "user" ? "You" : "Assistant"}
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {renderInline(m.content)}
              </div>
              {m.role === "assistant" && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => {}}>
                    <ThumbsUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => {}}>
                    <ThumbsDown className="h-3.5 w-3.5" />
                  </Button>
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
                <HelpCircle
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: "var(--sm-primary)" }}
                />
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
