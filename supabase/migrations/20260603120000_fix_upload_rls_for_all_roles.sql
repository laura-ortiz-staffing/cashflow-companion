-- Fix: invoice INSERT was still gated on 'admin_uploader' (now 'admin') and
-- excluded 'viewer' entirely. Both admin and viewer must be able to upload.
DROP POLICY "Uploaders create invoices" ON public.invoices;

CREATE POLICY "Uploaders create invoices" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = uploaded_by AND (
      public.has_role(auth.uid(), 'super_admin') OR
      public.has_role(auth.uid(), 'admin')       OR
      public.has_role(auth.uid(), 'viewer')
    )
  );

-- Fix: petty_cash_balance was ALL-super_admin only, blocking admin/viewer from
-- inserting inflows and from reading the inflow list on the Cash page.
-- Split into three focused policies:

DROP POLICY "Super admins manage balance" ON public.petty_cash_balance;

-- Super admin retains full control (SELECT / INSERT / UPDATE / DELETE)
CREATE POLICY "Super admins manage balance" ON public.petty_cash_balance
  FOR ALL
  USING  (public.has_role(auth.uid(), 'super_admin'));

-- All authenticated users can read balance entries
-- (UI already hides the totals from Viewer, RLS does not need to enforce that)
CREATE POLICY "Authenticated read balance" ON public.petty_cash_balance
  FOR SELECT TO authenticated
  USING (true);

-- Admin and Viewer can register cash inflows
CREATE POLICY "Admin viewer insert inflows" ON public.petty_cash_balance
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'viewer')
  );
