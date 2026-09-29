-- Task 1: plan name field on subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_name TEXT;

-- Task 2: make assigned_email nullable (licenses can be assigned without email)
ALTER TABLE public.sm_license_assignments
  ALTER COLUMN assigned_email DROP NOT NULL;

-- Task 3: assignee type (employee / client / project) and optional reference
ALTER TABLE public.sm_license_assignments
  ADD COLUMN IF NOT EXISTS assignee_type TEXT NOT NULL DEFAULT 'employee',
  ADD COLUMN IF NOT EXISTS assignee_ref  TEXT;

ALTER TABLE public.sm_license_assignments
  DROP CONSTRAINT IF EXISTS sm_license_assignments_assignee_type_check;
ALTER TABLE public.sm_license_assignments
  ADD CONSTRAINT sm_license_assignments_assignee_type_check
  CHECK (assignee_type IN ('employee', 'client', 'project'));
