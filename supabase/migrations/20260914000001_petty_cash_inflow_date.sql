-- Add transaction_date to petty_cash_balance so inflows can be assigned
-- to the month they actually belong to, regardless of when they are recorded.
-- Previously the app filtered inflows by created_at, forcing late transfers
-- into the wrong period.

ALTER TABLE public.petty_cash_balance
  ADD COLUMN IF NOT EXISTS transaction_date DATE;

-- Backfill existing rows using their created_at date in Bogotá timezone.
UPDATE public.petty_cash_balance
  SET transaction_date = (created_at AT TIME ZONE 'America/Bogota')::DATE
  WHERE transaction_date IS NULL;

ALTER TABLE public.petty_cash_balance
  ALTER COLUMN transaction_date SET NOT NULL,
  ALTER COLUMN transaction_date SET DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS petty_cash_balance_txn_date_idx
  ON public.petty_cash_balance (transaction_date);
