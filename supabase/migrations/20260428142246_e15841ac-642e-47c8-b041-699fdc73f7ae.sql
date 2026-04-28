
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin_uploader', 'viewer');
CREATE TYPE public.invoice_status AS ENUM ('draft', 'submitted', 'under_review', 'approved', 'rejected');
CREATE TYPE public.invoice_category AS ENUM ('office_supplies', 'travel', 'meals', 'transport', 'utilities', 'maintenance', 'marketing', 'other');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY DEFINER ROLE CHECK ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id ORDER BY
    CASE role
      WHEN 'super_admin' THEN 1
      WHEN 'admin_uploader' THEN 2
      WHEN 'viewer' THEN 3
    END
  LIMIT 1;
$$;

-- ============ INVOICES ============
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE DEFAULT 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  vendor TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  category public.invoice_category NOT NULL DEFAULT 'other',
  notes TEXT,
  status public.invoice_status NOT NULL DEFAULT 'submitted',
  file_url TEXT,
  file_name TEXT,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_date ON public.invoices(invoice_date DESC);
CREATE INDEX idx_invoices_uploaded_by ON public.invoices(uploaded_by);

-- ============ INVOICE STATUS LOGS ============
CREATE TABLE public.invoice_status_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  previous_status public.invoice_status,
  new_status public.invoice_status NOT NULL,
  comment TEXT,
  changed_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.invoice_status_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_status_logs_invoice ON public.invoice_status_logs(invoice_id);

-- ============ AUDIT LOGS (immutable) ============
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  previous_state JSONB,
  new_state JSONB,
  metadata JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_id, read);

-- ============ PETTY CASH BALANCE ============
CREATE TABLE public.petty_cash_balance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount NUMERIC(12, 2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'adjustment', 'expense')),
  description TEXT,
  invoice_id UUID REFERENCES public.invoices(id),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.petty_cash_balance ENABLE ROW LEVEL SECURITY;

-- ============ RLS POLICIES ============

-- profiles
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Super admins view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- user_roles
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Super admins view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admins manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));

-- invoices
CREATE POLICY "All authenticated view invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Uploaders create invoices" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = uploaded_by AND (
      public.has_role(auth.uid(), 'admin_uploader') OR public.has_role(auth.uid(), 'super_admin')
    )
  );
CREATE POLICY "Super admins update invoices" ON public.invoices FOR UPDATE
  USING (public.has_role(auth.uid(), 'super_admin') AND locked = false);
CREATE POLICY "Super admins delete invoices" ON public.invoices FOR DELETE
  USING (public.has_role(auth.uid(), 'super_admin') AND locked = false);

-- invoice_status_logs
CREATE POLICY "All authenticated view status logs" ON public.invoice_status_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "System creates status logs" ON public.invoice_status_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = changed_by);

-- audit_logs (immutable: insert + super admin select only)
CREATE POLICY "Super admins view audit logs" ON public.audit_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Authenticated users insert audit logs" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- notifications
CREATE POLICY "Users view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = recipient_id);
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = recipient_id);
CREATE POLICY "Authenticated insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

-- petty_cash_balance
CREATE POLICY "All authenticated view balance" ON public.petty_cash_balance FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins manage balance" ON public.petty_cash_balance FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));

-- ============ TRIGGERS ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  -- First user becomes super_admin, others viewer by default
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE WHEN (SELECT COUNT(*) FROM public.user_roles) = 0 THEN 'super_admin'::public.app_role
         ELSE 'viewer'::public.app_role END
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Status log trigger
CREATE OR REPLACE FUNCTION public.log_invoice_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.invoice_status_logs (invoice_id, previous_status, new_status, comment, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, NEW.rejection_reason, COALESCE(auth.uid(), NEW.uploaded_by));

    -- Lock when approved
    IF NEW.status = 'approved' THEN
      NEW.locked = true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_invoice_status_change
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.log_invoice_status_change();

-- Notify super admins on invoice events
CREATE OR REPLACE FUNCTION public.notify_super_admins()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id UUID;
  msg TEXT;
  ttl TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    ttl := 'New invoice uploaded';
    msg := 'Invoice ' || NEW.invoice_number || ' from ' || NEW.vendor || ' for $' || NEW.amount::TEXT;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    ttl := 'Invoice status changed';
    msg := 'Invoice ' || NEW.invoice_number || ' is now ' || NEW.status::TEXT;
  ELSE
    RETURN NEW;
  END IF;

  FOR admin_id IN SELECT user_id FROM public.user_roles WHERE role = 'super_admin' LOOP
    INSERT INTO public.notifications (recipient_id, title, message, type, link)
    VALUES (admin_id, ttl, msg, 'invoice', '/invoices/' || NEW.id);
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_invoice_notify
  AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.notify_super_admins();

-- ============ STORAGE ============
INSERT INTO storage.buckets (id, name, public) VALUES ('invoices', 'invoices', false);

CREATE POLICY "Authenticated read invoices files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'invoices');
CREATE POLICY "Authenticated upload invoices" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoices' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Super admins delete files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'invoices' AND public.has_role(auth.uid(), 'super_admin'));

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
