import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useState, useRef, useEffect, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MessageCircle, Save, Plus, X, Phone, Send, Settings, Bot, FileDown } from "lucide-react";
import { fetchAndBuildReport } from "@/lib/buildReport";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { logAction } from "@/lib/audit";

export const Route = createFileRoute("/whatsapp")({
  component: () => <AppShell><AppBot /></AppShell>,
});

type Settings = {
  provider: "twilio" | "meta";
  bot_phone_number: string | null;
  webhook_url: string | null;
  authorized_numbers: string[];
  status: "not_connected" | "connected";
};

type PdfParams = { from: string; to: string; category: string; status: string; periodLabel: string };
type Msg = { role: "user" | "assistant"; content: string; pdfParams?: PdfParams };

const ALL_PERM_SECTIONS: Record<string, string> = {
  invoices: "Invoices",
  cash: "Cash Control",
  requests: "Requests",
  reports: "Reports",
  sync: "Excel Sync",
};

function buildAccessContext(role: string | null, permissions: string[]): string {
  if (role === "super_admin") {
    return "User role: super_admin. Has full access to all sections of the app.";
  }
  const granted = Object.entries(ALL_PERM_SECTIONS)
    .filter(([key]) => permissions.includes(key))
    .map(([, label]) => label);
  const blocked = Object.entries(ALL_PERM_SECTIONS)
    .filter(([key]) => !permissions.includes(key))
    .map(([, label]) => label);
  const base = ["Dashboard", "Q&A", "App Bot"];
  if (role === "admin") base.push("Upload");
  return [
    `User role: ${role ?? "viewer"}.`,
    `Accessible sections: ${[...base, ...granted].join(", ")}.`,
    blocked.length > 0
      ? `Restricted sections (do NOT discuss, summarize data from, or link to): ${blocked.join(", ")}. If asked about these, say: "You don't have access to that section. Ask your Super Admin to grant you permission."`
      : "No restricted sections.",
  ].join(" ");
}

function AppBot() {
  const { role, permissions } = useAuth();
  const canEdit = role === "super_admin";
  
  // Chat state
  const [query, setQuery] = useState("");
  const [chat, setChat] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Settings state
  const [s, setS] = useState<Settings | null>(null);
  const [newNumber, setNewNumber] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);

  useEffect(() => {
    supabase.from("whatsapp_settings").select("*").eq("id", true).maybeSingle()
      .then(({ data }) => {
        if (data) setS(data as Settings);
        else setS({ provider: "twilio", bot_phone_number: null, webhook_url: null, authorized_numbers: [], status: "not_connected" });
      });
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat, busy]);

  const ask = async (e?: FormEvent) => {
    e?.preventDefault();
    const question = query.trim();
    if (!question) return;
    setBusy(true);
    setChat((c) => [...c, { role: "user", content: question }]);
    setQuery("");
    try {
      const { data, error } = await supabase.functions.invoke("app-bot", {
        body: { question, history: chat.slice(-6), role, permissions, accessContext: buildAccessContext(role, permissions) },
      });
      if (error) throw error;
      const resp = data as { answer?: string; pdf_params?: PdfParams };
      const answer = resp?.answer ?? "No answer.";
      setChat((c) => [...c, { role: "assistant", content: answer, pdfParams: resp?.pdf_params }]);
    } catch (err) {
      console.error(err);
      setChat((c) => [...c, { role: "assistant", content: "Sorry, an error occurred connecting to the AI." }]);
    } finally {
      setBusy(false);
    }
  };

  const updateSettings = (patch: Partial<Settings>) => {
    if (s) setS({ ...s, ...patch });
  };

  const addNumber = () => {
    if (!s) return;
    const n = newNumber.trim();
    if (!n) return;
    if (!/^\\+?\\d{8,15}$/.test(n.replace(/\\s/g, ""))) {
      toast.error("Invalid number (use international format with +)");
      return;
    }
    if (s.authorized_numbers.includes(n)) return;
    updateSettings({ authorized_numbers: [...s.authorized_numbers, n] });
    setNewNumber("");
  };

  const removeNumber = (n: string) => {
    if (!s) return;
    updateSettings({ authorized_numbers: s.authorized_numbers.filter(x => x !== n) });
  };

  const saveSettings = async () => {
    if (!canEdit || !s) return;
    setSettingsBusy(true);
    const { error } = await supabase
      .from("whatsapp_settings")
      .upsert({
        id: true,
        provider: s.provider,
        bot_phone_number: s.bot_phone_number,
        webhook_url: s.webhook_url,
        authorized_numbers: s.authorized_numbers,
        status: s.bot_phone_number ? s.status : "not_connected",
      });
    setSettingsBusy(false);
    if (error) { toast.error(error.message); return; }
    await logAction({ action: "whatsapp.settings.updated", entity_type: "whatsapp_settings", new_state: s as never });
    toast.success("Twilio settings saved");
  };

  return (
    <div className="space-y-6 h-[calc(100vh-6rem)] flex flex-col">
      <div className="flex items-end justify-between shrink-0">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">App Bot</div>
          <h1 className="font-display text-3xl tracking-tight flex items-center gap-2">
            <Bot className="h-8 w-8 text-primary" /> Report Assistant
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {role === "super_admin"
              ? "Full access — ask about invoices, balances, reports, requests, or any section of the app."
              : (() => {
                  const granted = Object.entries(ALL_PERM_SECTIONS).filter(([k]) => permissions.includes(k)).map(([, v]) => v);
                  const base = role === "admin" ? ["Upload"] : [];
                  const all = [...base, ...granted];
                  return all.length > 0
                    ? `You can ask about: Dashboard${all.length ? ", " + all.join(", ") : ""}. For other sections, ask your Super Admin to grant access.`
                    : "You can ask general questions about the app and petty cash concepts. For section-specific data, ask your Super Admin to grant access.";
                })()
            }
          </p>
        </div>

        {canEdit && s && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Settings className="h-4 w-4" /> Configure Twilio SMS
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>WhatsApp / SMS Bot Settings</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-4 pt-4">
                <div className="space-y-1.5">
                  <Label>Bot phone number</Label>
                  <Input
                    value={s.bot_phone_number ?? ""}
                    onChange={(e) => updateSettings({ bot_phone_number: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Webhook URL</Label>
                  <Input
                    value={s.webhook_url ?? ""}
                    onChange={(e) => updateSettings({ webhook_url: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Authorized phone numbers</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="+57 300 000 0000"
                      value={newNumber}
                      onChange={(e) => setNewNumber(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNumber(); } }}
                    />
                    <Button type="button" variant="outline" onClick={addNumber}>Add</Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.authorized_numbers.map((n) => (
                      <Badge key={n} variant="secondary" className="gap-1.5">
                        <Phone className="h-3 w-3" /> {n}
                        <button onClick={() => removeNumber(n)} className="ml-1 opacity-60 hover:opacity-100">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button onClick={saveSettings} disabled={settingsBusy} className="bg-primary text-primary-foreground">
                    <Save className="mr-1.5 h-4 w-4" /> Save settings
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden border shadow-sm">
        <div ref={scrollRef} className="flex-1 p-5 overflow-y-auto bg-muted/10">
          {chat.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground opacity-70">
              <MessageCircle className="h-16 w-16 mb-4 opacity-20 text-primary" />
              <p className="text-lg font-medium text-foreground">Hi! I'm your Cashflow Assistant.</p>
              <p className="max-w-md mt-2 text-sm">
                You can ask me for expense summaries, check invoice statuses, or request quick links to any report.
              </p>
            </div>
          ) : (
            <div className="space-y-6 max-w-4xl mx-auto">
              {chat.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl p-4 text-sm shadow-sm ${m.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border text-card-foreground rounded-bl-sm whitespace-pre-wrap"}`}>
                    {m.content}
                    {m.pdfParams && <PdfDownloadButton params={m.pdfParams} />}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl p-4 text-sm bg-card border rounded-bl-sm italic opacity-60 flex items-center gap-2">
                    <Bot className="h-4 w-4 animate-pulse" /> Typing response...
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="p-4 border-t bg-card">
          <form onSubmit={ask} className="flex items-center gap-3 max-w-4xl mx-auto">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type your message for the assistant..."
              className="flex-1 h-12 rounded-xl bg-muted/50"
              disabled={busy}
            />
            <Button type="submit" size="icon" className="h-12 w-12 rounded-xl shadow-md transition-transform hover:scale-105 active:scale-95" disabled={busy || !query.trim()}>
              <Send className="h-5 w-5" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}

function PdfDownloadButton({ params }: { params: PdfParams }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const { doc, filename } = await fetchAndBuildReport(params);
      doc.save(filename);
      toast.success("PDF downloaded");
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={download}
      disabled={busy}
      className="mt-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
    >
      <FileDown className="h-3.5 w-3.5" />
      {busy ? "Generating PDF…" : `Download report (${params.from} → ${params.to})`}
    </button>
  );
}
