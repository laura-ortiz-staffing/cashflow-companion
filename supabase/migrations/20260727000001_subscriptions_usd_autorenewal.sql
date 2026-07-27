-- Corporate card subscriptions use USD; add auto_renewal flag and exchange_rate reference.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS auto_renewal  BOOLEAN      NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(12,4);
