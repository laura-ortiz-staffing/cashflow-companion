-- Subscriptions: recurring services tracked by the company.
-- Apply this migration when ready to go live.

CREATE TABLE public.subscriptions (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT          NOT NULL,
  vendor                TEXT,
  description           TEXT,
  amount                NUMERIC(12,2) NOT NULL,
  currency              TEXT          NOT NULL DEFAULT 'COP',
  billing_cycle         TEXT          NOT NULL,
  billing_interval_days INT,
  payment_method        TEXT          NOT NULL,
  next_billing_date     DATE          NOT NULL,
  renewal_date          DATE,
  expiry_date           DATE,
  last_paid_at          DATE,
  status                TEXT          NOT NULL DEFAULT 'active',
  category              TEXT,
  reminder_days_before  INT[]         NOT NULL DEFAULT '{3,7}',
  service_url           TEXT,
  notes                 TEXT,
  created_by            UUID          NOT NULL REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  cancelled_at          TIMESTAMPTZ,
  cancelled_by          UUID          REFERENCES auth.users(id),

  CONSTRAINT subscriptions_billing_cycle_check
    CHECK (billing_cycle IN ('monthly','quarterly','semiannual','annual','custom')),
  CONSTRAINT subscriptions_payment_method_check
    CHECK (payment_method IN ('petty_cash','corporate_card')),
  CONSTRAINT subscriptions_status_check
    CHECK (status IN ('draft','active','paused','cancelled','expired'))
);

CREATE TABLE public.subscription_payment_logs (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID          NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  amount          NUMERIC(12,2) NOT NULL,
  payment_date    DATE          NOT NULL,
  payment_method  TEXT          NOT NULL,
  invoice_id      UUID          REFERENCES public.invoices(id) ON DELETE SET NULL,
  reference       TEXT,
  notes           TEXT,
  recorded_by     UUID          NOT NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT spl_payment_method_check
    CHECK (payment_method IN ('petty_cash','corporate_card'))
);

-- Auto-update updated_at on edits
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.subscriptions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payment_logs ENABLE ROW LEVEL SECURITY;

-- super_admin: full access
CREATE POLICY "subscriptions_super_admin_all"
  ON public.subscriptions FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

-- admin: read only (no permission string required)
CREATE POLICY "subscriptions_admin_select"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- viewer with subscriptions_write: can insert
CREATE POLICY "subscriptions_viewer_insert"
  ON public.subscriptions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'viewer')
    AND EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = auth.uid() AND permission = 'subscriptions_write'
    )
  );

-- viewer with subscriptions OR subscriptions_write: can select
CREATE POLICY "subscriptions_viewer_select"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'viewer')
    AND EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = auth.uid()
        AND permission IN ('subscriptions', 'subscriptions_write')
    )
  );

-- payment logs: mirror subscriptions access
CREATE POLICY "spl_super_admin_all"
  ON public.subscription_payment_logs FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "spl_admin_select"
  ON public.subscription_payment_logs FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- viewers cannot insert payment logs — only super_admin can register payments

CREATE POLICY "spl_viewer_select"
  ON public.subscription_payment_logs FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'viewer')
    AND EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = auth.uid()
        AND permission IN ('subscriptions', 'subscriptions_write')
    )
  );

-- ── pg_cron reminder job (Supabase Pro only — set up via dashboard) ───────────
-- Run once ready:
-- SELECT cron.schedule(
--   'check-subscription-reminders',
--   '0 8 * * *',
--   $$ SELECT public.check_subscription_reminders(); $$
-- );
