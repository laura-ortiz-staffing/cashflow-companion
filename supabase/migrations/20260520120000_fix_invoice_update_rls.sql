DROP POLICY "Super admins update invoices" ON public.invoices;
CREATE POLICY "Super admins update invoices" ON public.invoices FOR UPDATE
  USING (public.has_role(auth.uid(), 'super_admin') AND locked = false)
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
