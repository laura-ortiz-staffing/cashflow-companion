import { useState, useRef, type FormEvent, useEffect } from "react";
import { MessageCircle, Send, X, Bot, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";

type Msg = { role: "user" | "assistant"; content: string };

export function WhatsAppBubble() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [chat, setChat] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from("whatsapp_settings").select("bot_phone_number,status").eq("id", true).maybeSingle()
      .then(({ data }) => {
        if (data && data.status === "connected" && data.bot_phone_number) {
          setWaPhone(data.bot_phone_number);
        }
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
        body: { question, history: chat.slice(-6) },
      });
      if (error) throw error;
      const answer = (data as { answer?: string })?.answer ?? "No answer.";
      setChat((c) => [...c, { role: "assistant", content: answer }]);
    } catch (err) {
      console.error(err);
      setChat((c) => [...c, { role: "assistant", content: "Sorry, I had an error connecting to the AI." }]);
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  const waHref = waPhone
    ? `https://wa.me/${waPhone.replace(/[^\\d]/g, "")}?text=${encodeURIComponent("Hi, I'd like to talk to the AI Assistant.")}`
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-elegant transition-transform hover:scale-105"
          aria-label="Chat with Assistant"
        >
          {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-[350px] p-0 mb-4 rounded-xl shadow-xl overflow-hidden border-border z-50">
        <div className="bg-gradient-primary p-4 text-primary-foreground flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <div className="flex-1">
              <h4 className="font-semibold text-sm">Virtual Assistant</h4>
              <p className="text-xs opacity-90">Ask me about reports and invoices</p>
            </div>
          </div>
          {waHref && (
            <a 
              href={waHref} 
              target="_blank" 
              rel="noreferrer"
              className="mt-1 flex items-center gap-1.5 text-xs text-primary-foreground/80 hover:text-white transition-colors"
            >
              <MessageCircle className="h-3 w-3" /> Prefer to use WhatsApp? <ExternalLink className="h-3 w-3 ml-auto" />
            </a>
          )}
        </div>
        
        <div ref={scrollRef} className="h-[350px] p-4 bg-background overflow-y-auto">
          {chat.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground opacity-70">
              <MessageCircle className="h-10 w-10 mb-2 opacity-20" />
              <p className="text-sm">Hi! How can I help you today?</p>
            </div>
          ) : (
            <div className="space-y-4">
              {chat.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-lg p-3 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground rounded-br-none" : "bg-muted rounded-bl-none whitespace-pre-wrap"}`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-lg p-3 text-sm bg-muted rounded-bl-none italic opacity-50">
                    Typing...
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-3 border-t bg-background">
          <form onSubmit={ask} className="flex items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 text-sm h-9"
              disabled={busy}
            />
            <Button type="submit" size="icon" className="h-9 w-9" disabled={busy || !query.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  );
}
