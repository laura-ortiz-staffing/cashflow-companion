-- Idempotent: drop-if-exists before recreating each policy.

-- Fix invoice INSERT: allow admin and viewer (was only admin_uploader + super_admin)
DROP POLICY IF EXISTS "Uploaders create invoices" ON public.invoices;
CREATE POLICY "Uploaders create invoices" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = uploaded_by AND (
      public.has_role(auth.uid(), 'super_admin') OR
      public.has_role(auth.uid(), 'admin')       OR
      public.has_role(auth.uid(), 'viewer')
    )
  );

-- Fix petty_cash_balance: split into scoped policies
DROP POLICY IF EXISTS "Super admins manage balance"    ON public.petty_cash_balance;
DROP POLICY IF EXISTS "Authenticated read balance"     ON public.petty_cash_balance;
DROP POLICY IF EXISTS "Admin viewer insert inflows"    ON public.petty_cash_balance;

CREATE POLICY "Super admins manage balance" ON public.petty_cash_balance
  FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Authenticated read balance" ON public.petty_cash_balance
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin viewer insert inflows" ON public.petty_cash_balance
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'viewer')
  );
