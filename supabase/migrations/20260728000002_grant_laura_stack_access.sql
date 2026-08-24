-- Grant stack_management access to laura.ortiz@staffingglobal.org
INSERT INTO public.app_access (user_id, app)
SELECT id, 'stack_management'
FROM auth.users
WHERE email = 'laura.ortiz@staffingglobal.org'
ON CONFLICT (user_id, app) DO NOTHING;
