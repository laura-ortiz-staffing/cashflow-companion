-- Ensure super_admin (and all authenticated users) can SELECT requests and inflows.
-- These were created in earlier migrations applied manually; re-declaring is safe.

-- Requests: all authenticated users see all rows (super_admin reviews, admin/viewer track own)
DROP POLICY IF EXISTS "All authenticated view requests" ON public.requests;
CREATE POLICY "All authenticated view requests"
  ON public.requests FOR SELECT TO authenticated USING (true);

-- petty_cash_balance: all authenticated users can read (needed for Cash Control page)
DROP POLICY IF EXISTS "Authenticated read balance" ON public.petty_cash_balance;
CREATE POLICY "Authenticated read balance"
  ON public.petty_cash_balance FOR SELECT TO authenticated USING (true);

-- request_status_logs: same pattern
DROP POLICY IF EXISTS "All authenticated view request logs" ON public.request_status_logs;
CREATE POLICY "All authenticated view request logs"
  ON public.request_status_logs FOR SELECT TO authenticated USING (true);
