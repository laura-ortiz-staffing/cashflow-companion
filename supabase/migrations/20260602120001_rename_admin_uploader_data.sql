-- Step 2: migrate existing admin_uploader rows to admin (runs after enum value is committed)
UPDATE public.user_roles SET role = 'admin' WHERE role = 'admin_uploader';
