
-- Request status enum
CREATE TYPE public.request_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- Requests table
CREATE TABLE public.requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'COP',
  description TEXT,
  category invoice_category NOT NULL DEFAULT 'other',
  file_url TEXT,
  file_name TEXT,
  status public.request_status NOT NULL DEFAULT 'pending',
  requested_by UUID NOT NULL,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated view requests"
  ON public.requests FOR SELECT TO authenticated USING (true);

CREATE POLICY "Uploaders create requests"
  ON public.requests FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = requested_by
    AND (has_role(auth.uid(), 'admin_uploader') OR has_role(auth.uid(), 'super_admin'))
  );

CREATE POLICY "Super admins update requests"
  ON public.requests FOR UPDATE
  USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Requesters cancel own pending requests"
  ON public.requests FOR UPDATE TO authenticated
  USING (auth.uid() = requested_by AND status = 'pending')
  WITH CHECK (auth.uid() = requested_by AND status IN ('pending', 'cancelled'));

CREATE POLICY "Super admins delete requests"
  ON public.requests FOR DELETE
  USING (has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_requests_updated
  BEFORE UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Request status logs
CREATE TABLE public.request_status_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  previous_status public.request_status,
  new_status public.request_status NOT NULL,
  comment TEXT,
  changed_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.request_status_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated view request logs"
  ON public.request_status_logs FOR SELECT TO authenticated USING (true);

CREATE POLICY "System creates request logs"
  ON public.request_status_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = changed_by);

-- Trigger: log status changes on requests
CREATE OR REPLACE FUNCTION public.log_request_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.request_status_logs (request_id, previous_status, new_status, comment, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, NEW.review_comment, COALESCE(auth.uid(), NEW.requested_by));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_request_status
  BEFORE UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.log_request_status_change();

-- Trigger: notify super admins on request events
CREATE OR REPLACE FUNCTION public.notify_super_admins_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_id UUID;
  msg TEXT;
  ttl TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    ttl := 'New request submitted';
    msg := NEW.title || ' · ' || NEW.amount::TEXT || ' ' || NEW.currency;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    ttl := 'Request ' || NEW.status::TEXT;
    msg := NEW.title || ' is now ' || NEW.status::TEXT;
  ELSE
    RETURN NEW;
  END IF;

  FOR admin_id IN SELECT user_id FROM public.user_roles WHERE role = 'super_admin' LOOP
    INSERT INTO public.notifications (recipient_id, title, message, type, link)
    VALUES (admin_id, ttl, msg, 'request', '/requests');
  END LOOP;

  -- Also notify requester when status changes
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.requested_by IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, title, message, type, link)
    VALUES (NEW.requested_by, 'Your request ' || NEW.status::TEXT, NEW.title, 'request', '/requests');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_request_insert
  AFTER INSERT ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_super_admins_request();

CREATE TRIGGER trg_notify_request_update
  AFTER UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_super_admins_request();

-- Storage bucket for request attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('requests', 'requests', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated view request files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'requests');

CREATE POLICY "Uploaders upload request files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'requests'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Track if invoice_number was auto-extracted via OCR
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_number_source TEXT NOT NULL DEFAULT 'manual';

-- Notifications: enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
