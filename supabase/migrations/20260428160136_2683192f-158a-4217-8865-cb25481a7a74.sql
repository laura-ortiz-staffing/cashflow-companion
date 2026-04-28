DROP POLICY IF EXISTS "Uploaders create requests" ON public.requests;

CREATE POLICY "Admin uploaders create requests"
  ON public.requests FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = requested_by
    AND has_role(auth.uid(), 'admin_uploader')
  );