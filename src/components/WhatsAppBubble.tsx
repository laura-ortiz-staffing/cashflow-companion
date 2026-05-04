import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export function WhatsAppBubble() {
  const { role } = useAuth();
  const [phone, setPhone] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    supabase.from("whatsapp_settings").select("bot_phone_number,status").eq("id", true).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPhone(data.bot_phone_number);
          setConnected(data.status === "connected" && !!data.bot_phone_number);
        }
      });
  }, []);

  const isAdmin = role === "super_admin";
  // Hide bubble entirely if not connected and not super_admin (super_admin always sees it to access config)
  if (!connected && !isAdmin) return null;

  const waHref = connected && phone
    ? `https://wa.me/${phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent("Hi, I'd like a Petty Cash report.")}`
    : null;

  const cls = "fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-elegant transition-transform hover:scale-105";
  const label = connected ? "Chat with the Petty Cash bot on WhatsApp" : "Configure WhatsApp bot";

  if (waHref) {
    return (
      <a href={waHref} target="_blank" rel="noreferrer" className={cls} aria-label={label} title={label}>
        <MessageCircle className="h-6 w-6" />
      </a>
    );
  }
  return (
    <Link to="/whatsapp" className={cls} aria-label={label} title={label}>
      <MessageCircle className="h-6 w-6" />
      {!connected && <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-amber-400 ring-2 ring-background" />}
    </Link>
  );
}
