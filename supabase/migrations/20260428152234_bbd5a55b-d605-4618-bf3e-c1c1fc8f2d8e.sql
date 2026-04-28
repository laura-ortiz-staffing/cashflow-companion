-- Opening balance config (single row)
CREATE TABLE public.cash_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  opening_balance NUMERIC NOT NULL DEFAULT 2000000,
  currency TEXT NOT NULL DEFAULT 'COP',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  CONSTRAINT singleton CHECK (id = true)
);

ALTER TABLE public.cash_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated view cash settings"
  ON public.cash_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admins update cash settings"
  ON public.cash_settings FOR UPDATE
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins insert cash settings"
  ON public.cash_settings FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Validate non-negative + log changes to audit_logs
CREATE OR REPLACE FUNCTION public.validate_and_log_cash_settings()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.opening_balance < 0 THEN
    RAISE EXCEPTION 'Opening balance cannot be negative';
  END IF;
  NEW.updated_at = now();
  NEW.updated_by = COALESCE(auth.uid(), NEW.updated_by);

  IF TG_OP = 'UPDATE' AND OLD.opening_balance IS DISTINCT FROM NEW.opening_balance THEN
    INSERT INTO public.audit_logs (user_id, user_email, action, entity_type, entity_id,
      previous_state, new_state, metadata)
    VALUES (
      auth.uid(),
      (SELECT email FROM public.profiles WHERE id = auth.uid()),
      'opening_balance.updated',
      'cash_settings',
      NULL,
      jsonb_build_object('opening_balance', OLD.opening_balance),
      jsonb_build_object('opening_balance', NEW.opening_balance),
      jsonb_build_object('currency', NEW.currency)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cash_settings_validate
BEFORE INSERT OR UPDATE ON public.cash_settings
FOR EACH ROW EXECUTE FUNCTION public.validate_and_log_cash_settings();

-- Seed initial row
INSERT INTO public.cash_settings (id, opening_balance, currency)
VALUES (true, 2000000, 'COP')
ON CONFLICT (id) DO NOTHING;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_settings;

-- Inflows: validate non-negative on petty_cash_balance
CREATE OR REPLACE FUNCTION public.validate_cash_movement()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_petty_cash_validate
BEFORE INSERT OR UPDATE ON public.petty_cash_balance
FOR EACH ROW EXECUTE FUNCTION public.validate_cash_movement();

ALTER PUBLICATION supabase_realtime ADD TABLE public.petty_cash_balance;