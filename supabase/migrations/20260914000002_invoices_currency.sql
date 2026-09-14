-- Add currency support to invoices.
-- amount always stays in COP (what gets subtracted from cash balance).
-- amount_original and exchange_rate are stored for USD invoices.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS currency        TEXT    NOT NULL DEFAULT 'COP',
  ADD COLUMN IF NOT EXISTS amount_original NUMERIC,
  ADD COLUMN IF NOT EXISTS exchange_rate   NUMERIC;
