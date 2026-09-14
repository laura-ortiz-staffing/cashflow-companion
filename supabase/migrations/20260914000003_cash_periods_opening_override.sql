-- Allow cash_periods.opening_balance to be an explicit manual override.
-- When opening_is_override = FALSE (default), the app computes the opening
-- dynamically as: seed + all inflows before this month - all expenses before.
-- When TRUE, the stored value is used as-is (manual reconciliation correction).

ALTER TABLE public.cash_periods
  ADD COLUMN IF NOT EXISTS opening_is_override BOOLEAN NOT NULL DEFAULT FALSE;

-- All existing periods were auto-created; let the system recompute them.
UPDATE public.cash_periods SET opening_is_override = FALSE;
