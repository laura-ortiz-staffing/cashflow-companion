-- Monthly cash periods: one row per calendar month.
-- The opening_balance resets automatically each month via client-side auto-create.
-- History is preserved forever — navigating to past months shows their data.

ALTER TABLE public.cash_settings
  ADD COLUMN IF NOT EXISTS monthly_fund NUMERIC(12,2);

UPDATE public.cash_settings SET monthly_fund = opening_balance WHERE monthly_fund IS NULL;

CREATE TABLE public.cash_periods (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  year            INT           NOT NULL,
  month           INT           NOT NULL CHECK (month BETWEEN 1 AND 12),
  opening_balance NUMERIC(12,2) NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  created_by      UUID          REFERENCES auth.users(id),
  CONSTRAINT cash_periods_year_month_unique UNIQUE (year, month)
);

ALTER TABLE public.cash_periods ENABLE ROW LEVEL SECURITY;

-- super_admin: full CRUD
CREATE POLICY "cash_periods_super_admin_all"
  ON public.cash_periods FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

-- everyone else: read-only
CREATE POLICY "cash_periods_read"
  ON public.cash_periods FOR SELECT TO authenticated
  USING (true);
