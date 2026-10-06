-- =============================================================================
-- Stack Management: Projects & cost allocation
-- Tables: sm_projects, sm_project_subscriptions, sm_fx_rates
-- Extends: sm_license_assignments (project_id)
-- Apply from the Supabase SQL Editor.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PROJECTS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sm_projects (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT        NOT NULL,
  description          TEXT,
  kind                 TEXT        NOT NULL DEFAULT 'client'
                       CHECK (kind IN ('client', 'internal')),
  client_company       TEXT,
  client_contact_name  TEXT,
  client_contact_email TEXT,
  status               TEXT        NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'paused', 'finished')),
  created_by           UUID        REFERENCES auth.users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sm_projects_name_idx
  ON public.sm_projects (lower(name));

ALTER TABLE public.sm_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sm_projects_sm_users_select"
  ON public.sm_projects FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.app_access
    WHERE user_id = auth.uid() AND app = 'stack_management'
  ));

CREATE POLICY "sm_projects_super_admin_all"
  ON public.sm_projects FOR ALL TO authenticated
  USING  (public.has_sm_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_sm_role(auth.uid(), 'super_admin'));

CREATE TRIGGER sm_projects_updated_at
  BEFORE UPDATE ON public.sm_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_sm_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SUBSCRIPTION → PROJECT ALLOCATION
-- A subscription can be linked to several projects; each link takes a share.
-- The shares of one subscription can never add up to more than 100%.
-- Whatever is not allocated stays "unassigned".
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sm_project_subscriptions (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID         NOT NULL REFERENCES public.sm_projects(id) ON DELETE CASCADE,
  subscription_id UUID         NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  allocation_pct  NUMERIC(5,2) NOT NULL CHECK (allocation_pct > 0 AND allocation_pct <= 100),
  created_by      UUID         REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (project_id, subscription_id)
);

CREATE INDEX IF NOT EXISTS sm_project_subs_project_idx ON public.sm_project_subscriptions (project_id);
CREATE INDEX IF NOT EXISTS sm_project_subs_sub_idx     ON public.sm_project_subscriptions (subscription_id);

CREATE OR REPLACE FUNCTION public.check_sm_allocation_total()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  other_total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(allocation_pct), 0) INTO other_total
  FROM public.sm_project_subscriptions
  WHERE subscription_id = NEW.subscription_id AND id <> NEW.id;

  IF other_total + NEW.allocation_pct > 100 THEN
    RAISE EXCEPTION 'Allocations for this subscription cannot exceed 100%% (already % allocated)', other_total
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sm_project_subs_check_total
  BEFORE INSERT OR UPDATE ON public.sm_project_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.check_sm_allocation_total();

ALTER TABLE public.sm_project_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sm_project_subs_sm_users_select"
  ON public.sm_project_subscriptions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.app_access
    WHERE user_id = auth.uid() AND app = 'stack_management'
  ));

CREATE POLICY "sm_project_subs_super_admin_all"
  ON public.sm_project_subscriptions FOR ALL TO authenticated
  USING  (public.has_sm_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_sm_role(auth.uid(), 'super_admin'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LICENSE → PROJECT
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.sm_license_assignments
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.sm_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sm_license_project_idx
  ON public.sm_license_assignments (project_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. MONTHLY EXCHANGE RATE (COP per 1 USD)
-- One row per month, always stored on the first day of the month.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sm_fx_rates (
  month       DATE          PRIMARY KEY CHECK (month = date_trunc('month', month)::date),
  cop_per_usd NUMERIC(12,4) NOT NULL CHECK (cop_per_usd > 0),
  set_by      UUID          REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE public.sm_fx_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sm_fx_rates_sm_users_select"
  ON public.sm_fx_rates FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.app_access
    WHERE user_id = auth.uid() AND app = 'stack_management'
  ));

CREATE POLICY "sm_fx_rates_super_admin_all"
  ON public.sm_fx_rates FOR ALL TO authenticated
  USING  (public.has_sm_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_sm_role(auth.uid(), 'super_admin'));

CREATE TRIGGER sm_fx_rates_updated_at
  BEFORE UPDATE ON public.sm_fx_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_sm_updated_at();
