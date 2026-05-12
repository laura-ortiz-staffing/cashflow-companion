CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- INVITATIONS
CREATE TABLE public.invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  email TEXT NOT NULL,
  role public.app_role NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_by UUID NOT NULL,
  used_by UUID,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT invitations_status_check CHECK (status IN ('pending','used','expired','revoked'))
);

CREATE INDEX idx_invitations_token ON public.invitations(token);
CREATE INDEX idx_invitations_email ON public.invitations(email);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage invitations"
  ON public.invitations
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') AND created_by = auth.uid());

-- Public token lookup (returns minimal fields; safe to expose by token)
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(_token TEXT)
RETURNS TABLE(email TEXT, status TEXT, expires_at TIMESTAMPTZ, role public.app_role)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email, status, expires_at, role FROM public.invitations WHERE token = _token LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(TEXT) TO anon, authenticated;

-- Redeem an invitation as the currently signed-in user
CREATE OR REPLACE FUNCTION public.accept_invitation(_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.invitations%ROWTYPE;
  uid UUID := auth.uid();
  user_email TEXT;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT email INTO user_email FROM auth.users WHERE id = uid;

  SELECT * INTO inv FROM public.invitations WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF inv.status = 'used' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_used');
  END IF;
  IF inv.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'revoked');
  END IF;
  IF inv.expires_at < now() THEN
    UPDATE public.invitations SET status = 'expired' WHERE id = inv.id;
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;
  IF lower(inv.email) <> lower(user_email) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch');
  END IF;

  -- Mark used
  UPDATE public.invitations
    SET status = 'used', used_by = uid, used_at = now()
    WHERE id = inv.id;

  -- Ensure the user has the invited role (default viewer); do not downgrade super_admins
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = uid AND role = 'super_admin') THEN
    DELETE FROM public.user_roles WHERE user_id = uid;
    INSERT INTO public.user_roles (user_id, role) VALUES (uid, inv.role);
  END IF;

  -- Audit
  INSERT INTO public.audit_logs (user_id, user_email, action, entity_type, entity_id, new_state, metadata)
  VALUES (uid, user_email, 'invitation.accepted', 'invitation', inv.id,
    jsonb_build_object('email', inv.email, 'role', inv.role),
    jsonb_build_object('token_prefix', substr(_token, 1, 8)));

  RETURN jsonb_build_object('ok', true, 'role', inv.role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(TEXT) TO authenticated;

-- QA FEEDBACK
CREATE TABLE public.qa_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  helpful BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.qa_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own qa feedback"
  ON public.qa_feedback FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own qa feedback"
  ON public.qa_feedback FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'));
