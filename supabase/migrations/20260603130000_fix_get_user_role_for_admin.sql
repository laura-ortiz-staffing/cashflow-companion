-- get_user_role CASE had no entry for 'admin' (added when admin_uploader was renamed).
-- Without it, ORDER BY returns NULL priority for admin rows (NULLS LAST), which is
-- fine when a user has only one role, but fragile if multiple rows exist.
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id ORDER BY
    CASE role
      WHEN 'super_admin'    THEN 1
      WHEN 'admin'          THEN 2
      WHEN 'admin_uploader' THEN 2
      WHEN 'viewer'         THEN 3
    END
  LIMIT 1;
$$;
