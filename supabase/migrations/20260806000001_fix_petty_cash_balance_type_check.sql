-- Fix petty_cash_balance type check constraint to include 'inflow'.
-- The app code inserts rows with type='inflow' and type='adjustment' but the
-- original constraint only allowed ('deposit', 'adjustment', 'expense'),
-- causing every inflow insert to fail with a check violation since ~July 2026.

ALTER TABLE public.petty_cash_balance
  DROP CONSTRAINT IF EXISTS petty_cash_balance_type_check;

ALTER TABLE public.petty_cash_balance
  ADD CONSTRAINT petty_cash_balance_type_check
  CHECK (type IN ('deposit', 'adjustment', 'expense', 'inflow'));
