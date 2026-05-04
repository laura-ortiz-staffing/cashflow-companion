import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageCircle, Save, Plus, X, Phone } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { logAction } from "@/lib/audit";

export const Route = createFileRoute("/whatsapp")({
  component: () => <AppShell><WhatsApp /></AppShell>,
});

type Settings = {
  provider: "twilio" | "meta";
  bot_phone_number: string | null;
  webhook_url: string | null;
  authorized_numbers: string[];
  status: "not_connected" | "connected";
};

const EXAMPLES = [
  "Send today's report",
  "Show pending requests",
  "Current cash balance",
  "Last 5 invoices uploaded",
  "Export this month to PDF",
];

function WhatsApp() {
  const { role } = useAuth();
  const canEdit = role === "super_admin";
  const [s, setS] = useState<Settings | null>(null);
  const [newNumber, setNewNumber] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("whatsapp_settings").select("*").eq("id", true).maybeSingle()
      .then(({ data }) => {
        if (data) setS(data as Settings);
        else setS({ provider: "twilio", bot_phone_number: null, webhook_url: null, authorized_numbers: [], status: "not_connected" });
      });
  }, []);

  if (!s) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const update = (patch: Partial<Settings>) => setS({ ...s, ...patch });

  const addNumber = () => {
    const n = newNumber.trim();
    if (!n) return;
    if (!/^\+?\d{8,15}$/.test(n.replace(/\s/g, ""))) {
      toast.error("Invalid phone number (use international format)");
      return;
    }
    if (s.authorized_numbers.includes(n)) return;
    update({ authorized_numbers: [...s.authorized_numbers, n] });
    setNewNumber("");
  };
  const removeNumber = (n: string) => update({ authorized_numbers: s.authorized_numbers.filter(x => x !== n) });

  const save = async () => {
    if (!canEdit) return;
    setBusy(true);
    const { error } = await supabase
      .from("whatsapp_settings")
      .update({
        provider: s.provider,
        bot_phone_number: s.bot_phone_number,
        webhook_url: s.webhook_url,
        authorized_numbers: s.authorized_numbers,
        status: s.bot_phone_number ? s.status : "not_connected",
      })
      .eq("id", true);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await logAction({ action: "whatsapp.settings.updated", entity_type: "whatsapp_settings", new_state: s as never });
    toast.success("WhatsApp settings saved");
  };

  const connected = s.status === "connected" && !!s.bot_phone_number;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Integrations</div>
          <h1 className="font-display text-3xl tracking-tight">WhatsApp Bot</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure the report-request bot. The official number isn't active yet — settings are saved for when it goes live.
          </p>
        </div>
        <Badge variant={connected ? "default" : "outline"} className="gap-1.5 self-start">
          <MessageCircle className="h-3 w-3" />
          {connected ? "Connected" : "Not connected"}
        </Badge>
      </div>

      <Card className="p-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Select value={s.provider} onValueChange={(v) => update({ provider: v as "twilio" | "meta" })} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="twilio">Twilio</SelectItem>
                <SelectItem value="meta">Meta Cloud API</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Bot phone number</Label>
            <Input
              placeholder="+57 300 000 0000"
              value={s.bot_phone_number ?? ""}
              onChange={(e) => update({ bot_phone_number: e.target.value })}
              disabled={!canEdit}
            />
          </div>

          <div className="space-y-1.5 lg:col-span-2">
            <Label>Webhook URL</Label>
            <Input
              placeholder="https://your-webhook-endpoint.example.com/whatsapp"
              value={s.webhook_url ?? ""}
              onChange={(e) => update({ webhook_url: e.target.value })}
              disabled={!canEdit}
            />
            <p className="text-xs text-muted-foreground">Endpoint that the provider will call when a message arrives. Configure once the official number is provisioned.</p>
          </div>

          <div className="space-y-1.5 lg:col-span-2">
            <Label>Authorized phone numbers</Label>
            <div className="flex gap-2">
              <Input
                placeholder="+57 300 000 0000"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNumber(); } }}
                disabled={!canEdit}
              />
              <Button type="button" variant="outline" onClick={addNumber} disabled={!canEdit}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </div>
            {s.authorized_numbers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No numbers yet. Only authorized numbers will receive bot replies.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {s.authorized_numbers.map((n) => (
                  <Badge key={n} variant="secondary" className="gap-1.5">
                    <Phone className="h-3 w-3" /> {n}
                    {canEdit && (
                      <button onClick={() => removeNumber(n)} className="ml-1 opacity-60 hover:opacity-100">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5 lg:col-span-2">
            <Label>Bot status</Label>
            <Select
              value={s.status}
              onValueChange={(v) => update({ status: v as "not_connected" | "connected" })}
              disabled={!canEdit || !s.bot_phone_number}
            >
              <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="not_connected">Not connected</SelectItem>
                <SelectItem value="connected">Connected</SelectItem>
              </SelectContent>
            </Select>
            {!s.bot_phone_number && <p className="text-xs text-muted-foreground">Add a bot phone number first to mark as connected.</p>}
          </div>
        </div>

        {canEdit && (
          <div className="mt-5 flex justify-end">
            <Button onClick={save} disabled={busy} className="bg-gradient-primary text-primary-foreground">
              <Save className="mr-1.5 h-4 w-4" /> Save settings
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="font-display text-lg">Report request examples</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Once connected, authorized users will be able to message the bot with prompts like:
        </p>
        <ul className="mt-3 space-y-2">
          {EXAMPLES.map((ex) => (
            <li key={ex} className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
              <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-mono text-xs">{ex}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="border-dashed p-5">
        <div className="text-sm text-muted-foreground">
          <strong className="text-foreground">Floating WhatsApp bubble:</strong>{" "}
          {connected ? "active and visible across the app." : "disabled — will appear automatically once the bot is connected."}
        </div>
      </Card>
    </div>
  );
}
