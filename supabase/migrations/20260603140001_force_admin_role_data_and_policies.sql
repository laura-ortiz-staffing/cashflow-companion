-- Force-run the data migration in case it was only marked "applied" without executing.
-- Safe to re-run: UPDATE is a no-op if rows already have role='admin'.
UPDATE public.user_roles SET role = 'admin' WHERE role = 'admin_uploader';

-- Rebuild INSERT policy for requests to accept both 'admin' and 'admin_uploader'
-- so any stale rows that weren't migrated still work.
DROP POLICY IF EXISTS "Uploaders create requests" ON public.requests;
CREATE POLICY "Uploaders create requests" ON public.requests
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = requested_by AND (
      public.has_role(auth.uid(), 'admin') OR
      public.has_role(auth.uid(), 'admin_uploader')
    )
  );

-- Rebuild INSERT policy for invoices with the same safety net.
DROP POLICY IF EXISTS "Uploaders create invoices" ON public.invoices;
CREATE POLICY "Uploaders create invoices" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = uploaded_by AND (
      public.has_role(auth.uid(), 'super_admin') OR
      public.has_role(auth.uid(), 'admin')       OR
      public.has_role(auth.uid(), 'admin_uploader') OR
      public.has_role(auth.uid(), 'viewer')
    )
  );
