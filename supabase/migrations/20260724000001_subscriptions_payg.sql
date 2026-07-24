-- Add pay_as_you_go billing cycle for usage-based services (AWS, etc.)
-- Also make next_billing_date nullable since PAYG has no fixed billing date.

ALTER TABLE public.subscriptions
  DROP CONSTRAINT subscriptions_billing_cycle_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_billing_cycle_check
    CHECK (billing_cycle IN ('monthly','quarterly','semiannual','annual','custom','pay_as_you_go'));

ALTER TABLE public.subscriptions
  ALTER COLUMN next_billing_date DROP NOT NULL;
