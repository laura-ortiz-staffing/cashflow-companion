-- Full purge of admin_uploader from the system.
-- No rows should have this value (prior migrations ran UPDATE), but we re-run to be safe.
UPDATE public.user_roles SET role = 'admin' WHERE role = 'admin_uploader';

-- Drop the stale policy that still hardcodes admin_uploader.
DROP POLICY IF EXISTS "Admin uploaders create requests" ON public.requests;

-- ── Enum swap ─────────────────────────────────────────────────────────────────
-- PostgreSQL cannot remove an enum value in place, so we:
-- 1. Create a new enum without admin_uploader
-- 2. Drop the two functions whose signatures reference the old type
-- 3. Swap column types
-- 4. Drop old type, rename new
-- 5. Recreate functions + all policies that depended on has_role

-- Drop policies that directly reference user_roles.role in a subquery
-- (they block ALTER COLUMN TYPE even though the type is app_role, not app_role_new)
DROP POLICY IF EXISTS "read_permissions"              ON public.user_permissions;
DROP POLICY IF EXISTS "super_admin_insert_permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "super_admin_delete_permissions" ON public.user_permissions;

CREATE TYPE public.app_role_new AS ENUM ('super_admin', 'admin', 'viewer');

-- Drop ALL functions whose signatures reference the old type.
-- (CASCADE also drops any remaining RLS policy expressions that call them;
--  we rebuild every policy below so no data is lost.)
DROP FUNCTION IF EXISTS public.has_role(UUID, public.app_role) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_role(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_invitation_by_token(TEXT) CASCADE;

-- Swap column on user_roles (drop default first, it can't auto-cast)
ALTER TABLE public.user_roles ALTER COLUMN role DROP DEFAULT;
ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE public.app_role_new
  USING role::text::public.app_role_new;
ALTER TABLE public.user_roles ALTER COLUMN role SET DEFAULT 'viewer';

-- Swap column on invitations if it uses the same type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invitations'
      AND column_name = 'role' AND udt_name = 'app_role'
  ) THEN
    ALTER TABLE public.invitations ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE public.invitations
      ALTER COLUMN role TYPE public.app_role_new
      USING role::text::public.app_role_new;
    ALTER TABLE public.invitations ALTER COLUMN role SET DEFAULT 'viewer';
  END IF;
END $$;

DROP TYPE  public.app_role;
ALTER TYPE public.app_role_new RENAME TO app_role;

-- ── Recreate core functions ───────────────────────────────────────────────────
CREATE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id
  ORDER BY CASE role
    WHEN 'super_admin' THEN 1
    WHEN 'admin'       THEN 2
    WHEN 'viewer'      THEN 3
  END
  LIMIT 1;
$$;

-- ── Rebuild all RLS policies that called has_role / get_user_role ─────────────

-- profiles
DROP POLICY IF EXISTS "Super admins view all profiles"    ON public.profiles;
DROP POLICY IF EXISTS "Users view own profile"            ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile"          ON public.profiles;
CREATE POLICY "Super admins view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- user_roles
DROP POLICY IF EXISTS "Super admins view all roles"   ON public.user_roles;
DROP POLICY IF EXISTS "Super admins manage roles"     ON public.user_roles;
DROP POLICY IF EXISTS "Users view own role"           ON public.user_roles;
CREATE POLICY "Super admins view all roles" ON public.user_roles
  FOR SELECT USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admins manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Users view own role" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- invoices
DROP POLICY IF EXISTS "Uploaders create invoices"        ON public.invoices;
DROP POLICY IF EXISTS "Super admins approve invoices"    ON public.invoices;
DROP POLICY IF EXISTS "Super admins delete invoices"     ON public.invoices;
DROP POLICY IF EXISTS "Authenticated view invoices"      ON public.invoices;
DROP POLICY IF EXISTS "Super admins update invoices"     ON public.invoices;
CREATE POLICY "Uploaders create invoices" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = uploaded_by AND (
      public.has_role(auth.uid(), 'super_admin') OR
      public.has_role(auth.uid(), 'admin')       OR
      public.has_role(auth.uid(), 'viewer')
    )
  );
CREATE POLICY "Authenticated view invoices" ON public.invoices
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins update invoices" ON public.invoices
  FOR UPDATE USING (public.has_role(auth.uid(), 'super_admin') AND locked = false);
CREATE POLICY "Super admins approve invoices" ON public.invoices
  FOR UPDATE USING (public.has_role(auth.uid(), 'super_admin') AND locked = false);
CREATE POLICY "Super admins delete invoices" ON public.invoices
  FOR DELETE USING (public.has_role(auth.uid(), 'super_admin'));

-- requests
DROP POLICY IF EXISTS "All authenticated view requests"           ON public.requests;
DROP POLICY IF EXISTS "Uploaders create requests"                 ON public.requests;
DROP POLICY IF EXISTS "Super admins update requests"              ON public.requests;
DROP POLICY IF EXISTS "Requesters cancel own pending requests"    ON public.requests;
DROP POLICY IF EXISTS "Super admins delete requests"              ON public.requests;
CREATE POLICY "All authenticated view requests" ON public.requests
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Uploaders create requests" ON public.requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requested_by AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Super admins update requests" ON public.requests
  FOR UPDATE USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Requesters cancel own pending requests" ON public.requests
  FOR UPDATE TO authenticated
  USING (auth.uid() = requested_by AND status = 'pending')
  WITH CHECK (auth.uid() = requested_by AND status IN ('pending', 'cancelled'));
CREATE POLICY "Super admins delete requests" ON public.requests
  FOR DELETE USING (public.has_role(auth.uid(), 'super_admin'));

-- petty_cash_balance
DROP POLICY IF EXISTS "Super admins manage balance"   ON public.petty_cash_balance;
DROP POLICY IF EXISTS "Authenticated read balance"    ON public.petty_cash_balance;
DROP POLICY IF EXISTS "Admin viewer insert inflows"   ON public.petty_cash_balance;
CREATE POLICY "Super admins manage balance" ON public.petty_cash_balance
  FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Authenticated read balance" ON public.petty_cash_balance
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin viewer insert inflows" ON public.petty_cash_balance
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'viewer')
  );

-- audit_logs
DROP POLICY IF EXISTS "Super admins view all logs"  ON public.audit_logs;
DROP POLICY IF EXISTS "Users insert own logs"       ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated view audit"    ON public.audit_logs;
CREATE POLICY "Super admins view all logs" ON public.audit_logs
  FOR SELECT USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Users insert own logs" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- notifications
DROP POLICY IF EXISTS "Users view own notifications"    ON public.notifications;
DROP POLICY IF EXISTS "Users update own notifications"  ON public.notifications;
CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = recipient_id);
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = recipient_id);

-- cash_settings
DROP POLICY IF EXISTS "Super admins manage settings"  ON public.cash_settings;
DROP POLICY IF EXISTS "Authenticated view settings"   ON public.cash_settings;
CREATE POLICY "Super admins manage settings" ON public.cash_settings
  FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Authenticated view settings" ON public.cash_settings
  FOR SELECT TO authenticated USING (true);

-- invitations
DROP POLICY IF EXISTS "Super admins manage invitations"  ON public.invitations;
DROP POLICY IF EXISTS "Anyone view own invitation"       ON public.invitations;
CREATE POLICY "Super admins manage invitations" ON public.invitations
  FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Anyone view own invitation" ON public.invitations
  FOR SELECT USING (true);

-- get_invitation_by_token (returns app_role — must recreate after type swap)
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(_token TEXT)
RETURNS TABLE(email TEXT, status TEXT, expires_at TIMESTAMPTZ, role public.app_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT email, status, expires_at, role FROM public.invitations WHERE token = _token LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(TEXT) TO anon, authenticated;

-- user_permissions (recreate with has_role now that the function exists)
CREATE POLICY "read_permissions" ON public.user_permissions
  FOR SELECT USING (
    auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin')
  );
CREATE POLICY "super_admin_insert_permissions" ON public.user_permissions
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "super_admin_delete_permissions" ON public.user_permissions
  FOR DELETE USING (public.has_role(auth.uid(), 'super_admin'));
