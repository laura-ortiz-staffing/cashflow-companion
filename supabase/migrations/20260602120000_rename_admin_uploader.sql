-- Step 1: add the new enum value (must commit before it can be used)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';
