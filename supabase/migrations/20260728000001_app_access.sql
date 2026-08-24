-- Application-level access control
-- Grants users access to: petty_cash, stack_management, or both.
-- Designed so app-specific roles can be added later without redesigning this table.

CREATE TYPE public.app_name AS ENUM ('petty_cash', 'stack_management');

CREATE TABLE public.app_access (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app          app_name    NOT NULL,
  granted_by   UUID        REFERENCES auth.users(id),
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, app)
);

ALTER TABLE public.app_access ENABLE ROW LEVEL SECURITY;

-- Users read their own access records
CREATE POLICY "app_access_self_select"
  ON public.app_access FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Super admins manage all app access
CREATE POLICY "app_access_super_admin_all"
  ON public.app_access FOR ALL TO authenticated
  USING  (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- RPC: returns array of app names the calling user has access to
CREATE OR REPLACE FUNCTION public.get_user_app_access(_user_id UUID)
RETURNS TEXT[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(app::TEXT ORDER BY app), '{}')
  FROM public.app_access
  WHERE user_id = _user_id;
$$;

-- Grant petty_cash access to ALL existing users
-- (everyone before Stack Management existed was a Petty Cash user)
INSERT INTO public.app_access (user_id, app)
SELECT id, 'petty_cash'
FROM auth.users
ON CONFLICT (user_id, app) DO NOTHING;
