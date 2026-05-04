
-- WhatsApp bot settings (singleton row, super_admin only)
CREATE TABLE public.whatsapp_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  provider TEXT NOT NULL DEFAULT 'twilio' CHECK (provider IN ('twilio', 'meta')),
  bot_phone_number TEXT,
  webhook_url TEXT,
  authorized_numbers TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'not_connected' CHECK (status IN ('not_connected', 'connected')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated view whatsapp settings"
  ON public.whatsapp_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admins insert whatsapp settings"
  ON public.whatsapp_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins update whatsapp settings"
  ON public.whatsapp_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

INSERT INTO public.whatsapp_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
